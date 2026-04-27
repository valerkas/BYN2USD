const PRICE_REGEX =
  /(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:р\.?|руб(?:\.|лей|ля|ль)?|byn|бел\.?\s*руб(?:\.|лей|ля|ль)?)/gi;
const USD_LINE_CLASS = "byn-usd-converted-line";
const processedNodes = new WeakSet();

function normalizeNumber(rawValue) {
  const normalized = rawValue.replace(/[ \u00A0]/g, "").replace(",", ".");
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
      font-size: 0.95em;
    }
  `;
  document.head.appendChild(style);
}

function buildConvertedFragment(text, usdRate) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  PRICE_REGEX.lastIndex = 0;
  let hasConversion = false;
  let match = PRICE_REGEX.exec(text);

  while (match) {
    const [fullMatch, amountText] = match;
    const start = match.index;
    const end = start + fullMatch.length;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    fragment.appendChild(document.createTextNode(fullMatch));

    const byn = normalizeNumber(amountText);
    if (byn && byn > 0) {
      const usd = byn / usdRate;
      const usdLine = document.createElement("span");
      usdLine.className = USD_LINE_CLASS;
      usdLine.textContent = `~$${usd.toFixed(2)}`;
      fragment.appendChild(usdLine);
      hasConversion = true;
    }

    lastIndex = end;
    match = PRICE_REGEX.exec(text);
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

  const convertedFragment = buildConvertedFragment(sourceText, usdRate);
  if (convertedFragment) {
    processedNodes.add(node);
    node.replaceWith(convertedFragment);
    return;
  }

  processedNodes.add(node);
}

function walkAndConvert(root, usdRate) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    processTextNode(current, usdRate);
    current = walker.nextNode();
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
} else {
  void init();
}
