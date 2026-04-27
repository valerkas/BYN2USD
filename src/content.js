const isAlreadyInitialized = Boolean(window.__BYN_USD_CONVERTER_INITIALIZED__);
window.__BYN_USD_CONVERTER_INITIALIZED__ = true;

const PRICE_REGEX =
  /(\d{1,3}(?:[ \u00A0\u202F]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:р\.?|руб(?:\.|лей|ля|ль)?|byn|бел\.?\s*руб(?:\.|лей|ля|ль)?)/gi;
const IMPLICIT_PRICE_REGEX = /(\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d{1,2})?|\d{4,7}(?:[.,]\d{1,2})?)/g;
const CURRENCY_TOKEN_REGEX = /(р\.?|руб(?:\.|лей|ля|ль)?|byn|бел\.?\s*руб(?:\.|лей|ля|ль)?)/i;
const DATE_CONTEXT_REGEX =
  /(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек|сегодня|вчера|дн|дней|нед|мес|год|г\.|date)/i;
const USD_LINE_CLASS = "byn-usd-converted-line";
const processedNodes = new WeakSet();

function normalizeNumber(rawValue) {
  const normalized = rawValue.replace(/[ \u00A0\u202F]/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
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
  style.textContent = `
    .${USD_LINE_CLASS} {
      display: block;
      margin-top: 2px;
      opacity: 0.9;
      font-size: 0.82em;
    }
  `;
  document.head.appendChild(style);
}

function isPriceLikeContext(element) {
  if (!element) {
    return false;
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

function buildConvertedFragment(text, usdRate, allowImplicitPrice) {
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
      usdLine.textContent = `~$${usd.toFixed(2)}`;
      fragment.appendChild(usdLine);
      hasConversion = true;
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
  if (!containsCurrencyToken && !parentLooksLikePrice) {
    processedNodes.add(node);
    return;
  }

  const convertedFragment = buildConvertedFragment(sourceText, usdRate, parentLooksLikePrice);
  if (convertedFragment) {
    processedNodes.add(node);
    node.replaceWith(convertedFragment);
    return;
  }

  processedNodes.add(node);
}

function walkAndConvert(root, usdRate) {
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
