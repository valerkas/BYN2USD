const isAlreadyInitialized = Boolean(window.__BYN_USD_CONVERTER_INITIALIZED__);
window.__BYN_USD_CONVERTER_INITIALIZED__ = true;

const CURRENCY_TOKEN =
  "р\\.?|руб(?:\\.|лей|ля|ль)?|byn|бел\\.?\\s*руб(?:\\.|лей|ля|ль)?";
const PRICE_REGEX = new RegExp(
  `(\\d{1,3}(?:[ \\u00A0\\u202F]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)\\s*(?:${CURRENCY_TOKEN})`,
  "gi"
);
const IMPLICIT_PRICE_REGEX = /(\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d{1,2})?|\d{4,7}(?:[.,]\d{1,2})?)/g;
const CURRENCY_TOKEN_REGEX = new RegExp(`(${CURRENCY_TOKEN})`, "i");
const DATE_CONTEXT_REGEX =
  /(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек|сегодня|вчера|дн|дней|нед|мес|год|г\.|date)/i;
const USD_LINE_CLASS = "byn-usd-converted-line";
const AV_BY_PRICE_BLOCK_SELECTOR =
  ".listing-item__price-primary, .listing-top__price-primary, [class*='__price-primary']";
const processedNodes = new WeakSet();
const kufarConvertedGroups = new WeakSet();
const avByProcessedPriceBlocks = new WeakSet();

function normalizeNumber(rawValue) {
  const normalized = rawValue.replace(/[ \u00A0\u202F]/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatUsd(usdValue) {
  const [integerPart, fractionalPart] = usdValue.toFixed(2).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${groupedInteger}.${fractionalPart}`;
}

function requestUsdRate() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_USD_RATE" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error ?? "Rate request failed"));
        return;
      }

      resolve(response.rate);
    });
  });
}

function ensureUsdLineStyle() {
  if (document.getElementById("byn-usd-converted-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "byn-usd-converted-style";
  const kufarInlinePrice = isKufarRealtySite()
    ? `
    [class*="price__byr"] .${USD_LINE_CLASS},
    [class*="styles_price__byr"] .${USD_LINE_CLASS},
    [class*="adview_mobile_price"] .${USD_LINE_CLASS},
    [class*="adview_desktop_price"] .${USD_LINE_CLASS},
    [class*="price--main"] .${USD_LINE_CLASS},
    [class*="styles_price__map"] .${USD_LINE_CLASS},
    p[class*="__price"] .${USD_LINE_CLASS},
    p[class*="styles_price__"] .${USD_LINE_CLASS} {
      display: inline;
      margin-left: 6px;
      margin-top: 0;
    }
  `
    : "";

  style.textContent = `
    .${USD_LINE_CLASS} {
      display: block;
      margin-top: 2px;
      opacity: 0.9;
      font-size: 0.82em;
    }
    ${kufarInlinePrice}
  `;
  document.head.appendChild(style);
}

function isKufarRealtySite() {
  return /(^|\.)re\.kufar\.by$/i.test(location.hostname);
}

function isAvBySite() {
  return /\.av\.by$/i.test(location.hostname);
}

function getAvByPriceBlock(element) {
  return element?.closest(AV_BY_PRICE_BLOCK_SELECTOR) ?? null;
}

function markTextNodesProcessed(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    processedNodes.add(current);
    current = walker.nextNode();
  }
}

function processAvByPriceBlock(block, usdRate) {
  if (!block || avByProcessedPriceBlocks.has(block)) {
    return;
  }

  if (block.querySelector(`.${USD_LINE_CLASS}`)) {
    avByProcessedPriceBlocks.add(block);
    markTextNodesProcessed(block);
    return;
  }

  const text = block.textContent.replace(/\s+/g, " ").trim();
  if (!CURRENCY_TOKEN_REGEX.test(text)) {
    return;
  }

  const convertedFragment = buildConvertedFragment(text, usdRate, false);
  const usdLine = convertedFragment?.querySelector(`.${USD_LINE_CLASS}`);
  if (!usdLine) {
    return;
  }

  avByProcessedPriceBlocks.add(block);
  markTextNodesProcessed(block);
  block.appendChild(usdLine);
}

function processAvByPriceBlocks(root, usdRate) {
  if (!isAvBySite()) {
    return;
  }

  for (const block of root.querySelectorAll(AV_BY_PRICE_BLOCK_SELECTOR)) {
    processAvByPriceBlock(block, usdRate);
  }
}

function isKufarMeterPrice(element) {
  return Boolean(
    element?.closest(
      '[class*="price__meter"], [class*="styles_price__meter"]'
    )
  );
}

function isKufarByrPrice(element) {
  return Boolean(
    element?.closest(
      '[class*="price__byr"], [class*="styles_price__byr"], [data-testid="card-price"]'
    )
  );
}

function isKufarMainPriceContext(element) {
  if (!element || isKufarMeterPrice(element)) {
    return false;
  }

  // Listing cards and map cards: total price in BYR.
  if (isKufarByrPrice(element)) {
    return true;
  }

  // Ad detail: sticky footer + desktop/mobile price widgets.
  if (
    element.closest(
      '[class*="price--main"], [class*="adview_mobile_price"], [class*="adview_desktop_price"]'
    )
  ) {
    return true;
  }

  const priceBlock = element.closest(
    '[class*="__price"], [class*="styles_price__"]'
  );
  if (!priceBlock || isKufarMeterPrice(priceBlock)) {
    return false;
  }

  const blockClass = String(priceBlock.className);
  if (/price__meter|styles_price__meter/i.test(blockClass)) {
    return false;
  }

  if (/price__map|styles_price__map/i.test(blockClass)) {
    return isKufarByrPrice(element);
  }

  // Similar ads and other listing price paragraphs/containers.
  return (
    priceBlock.matches(
      'p[class*="__price"], p[class*="styles_price__"], [class*="__main"]'
    ) || Boolean(element.closest('[class*="__main"]'))
  );
}

function getKufarConversionGroup(element) {
  return (
    element.closest('[data-testid*="realty-card"]') ||
    element.closest(
      '[class*="adview_mobile_price"], [class*="adview_desktop_price"]'
    ) ||
    element.closest('[class*="price--main"]')?.parentElement ||
    element.closest('[class*="styles_price__map"], [class*="price__map"]') ||
    element.closest('a[href*="/vi/"]') ||
    element.closest(
      '[class*="wrapper__adview"], [class*="adview_wrapper"], [class*="styles_wrapper__adview"]'
    )
  );
}

function isPriceLikeContext(element) {
  if (!element) {
    return false;
  }

  if (isKufarRealtySite()) {
    return isKufarMainPriceContext(element);
  }

  if (isAvBySite() && getAvByPriceBlock(element)) {
    return true;
  }

  const signature = `${element.className ?? ""} ${element.id ?? ""}`.toLowerCase();
  return /(price|cost|amount|sum|стоим|цен)/i.test(signature);
}

function shouldConvertImplicitAmount(text, start, end, byn) {
  if (!Number.isFinite(byn) || byn < 100) {
    return false;
  }

  // Common year values often appear in listing dates.
  if (Number.isInteger(byn) && byn >= 1900 && byn <= 2100) {
    return false;
  }

  const contextStart = Math.max(0, start - 24);
  const contextEnd = Math.min(text.length, end + 24);
  const nearText = text.slice(contextStart, contextEnd);
  if (DATE_CONTEXT_REGEX.test(nearText)) {
    return false;
  }

  return true;
}

function startsWithCurrencyToken(text) {
  if (!text) {
    return false;
  }

  return new RegExp(`^(\\s|[\\(\\[\\{])*(${CURRENCY_TOKEN})`, "i").test(text);
}

function buildConvertedFragment(text, usdRate, allowImplicitPrice, convertOnlyFirst = false) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  const regex = CURRENCY_TOKEN_REGEX.test(text) ? PRICE_REGEX : allowImplicitPrice ? IMPLICIT_PRICE_REGEX : null;
  if (!regex) {
    return null;
  }

  regex.lastIndex = 0;
  let hasConversion = false;
  let match = regex.exec(text);
  const useImplicitMatching = regex === IMPLICIT_PRICE_REGEX;

  while (match) {
    const [fullMatch, amountText] = match;
    const start = match.index;
    const end = start + fullMatch.length;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    fragment.appendChild(document.createTextNode(fullMatch));

    const byn = normalizeNumber(amountText);
    const canConvert =
      byn &&
      byn > 0 &&
      (!useImplicitMatching || shouldConvertImplicitAmount(text, start, end, byn));

    if (canConvert) {
      const usd = byn / usdRate;
      const usdLine = document.createElement("span");
      usdLine.className = USD_LINE_CLASS;
      usdLine.textContent = `~$${formatUsd(usd)}`;
      fragment.appendChild(usdLine);
      hasConversion = true;

      if (convertOnlyFirst) {
        lastIndex = end;
        break;
      }
    }

    lastIndex = end;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return hasConversion ? fragment : null;
}

function processTextNode(node, usdRate) {
  if (!node || !node.textContent) {
    return;
  }

  if (processedNodes.has(node)) {
    return;
  }

  const parent = node.parentElement;
  if (!parent || parent.closest("script, style, noscript, textarea")) {
    return;
  }

  const avByPriceBlock = getAvByPriceBlock(parent);
  if (avByPriceBlock) {
    processAvByPriceBlock(avByPriceBlock, usdRate);
    processedNodes.add(node);
    return;
  }

  if (
    node.nextSibling instanceof HTMLElement &&
    node.nextSibling.classList.contains(USD_LINE_CLASS)
  ) {
    return;
  }

  const sourceText = node.textContent;
  if (!sourceText.trim()) {
    return;
  }

  const parentLooksLikePrice = isPriceLikeContext(parent);
  const containsCurrencyToken = CURRENCY_TOKEN_REGEX.test(sourceText);
  const nextSiblingText =
    node.nextSibling && node.nextSibling.nodeType === Node.TEXT_NODE
      ? node.nextSibling.textContent
      : "";
  const hasCurrencyInNextSibling = startsWithCurrencyToken(nextSiblingText);

  // Avoid malformed output like "~$123 р." when amount and currency are split across text nodes.
  if (!containsCurrencyToken && parentLooksLikePrice && hasCurrencyInNextSibling) {
    processedNodes.add(node);
    return;
  }

  if (!parentLooksLikePrice) {
    processedNodes.add(node);
    return;
  }

  const onKufar = isKufarRealtySite();
  const kufarGroup = onKufar ? getKufarConversionGroup(parent) : null;
  if (kufarGroup && kufarConvertedGroups.has(kufarGroup)) {
    processedNodes.add(node);
    return;
  }

  const convertedFragment = buildConvertedFragment(
    sourceText,
    usdRate,
    onKufar ? false : parentLooksLikePrice,
    onKufar
  );
  if (convertedFragment) {
    processedNodes.add(node);
    if (kufarGroup) {
      kufarConvertedGroups.add(kufarGroup);
    }
    node.replaceWith(convertedFragment);
    return;
  }

  processedNodes.add(node);
}

function walkAndConvert(root, usdRate) {
  processAvByPriceBlocks(root, usdRate);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    processTextNode(node, usdRate);
  }
}

function startObserver(usdRate) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          processTextNode(node, usdRate);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          walkAndConvert(node, usdRate);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function init() {
  try {
    const usdRate = await requestUsdRate();
    ensureUsdLineStyle();
    walkAndConvert(document.body, usdRate);
    startObserver(usdRate);
  } catch (error) {
    console.error("BYN to USD extension error:", error);
  }
}

if (!isAlreadyInitialized) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void init();
    });
  } else {
    void init();
  }
}
