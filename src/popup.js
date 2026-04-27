const rateElement = document.getElementById("rate");

function setError(message) {
  rateElement.textContent = message;
  rateElement.classList.add("error");
}

chrome.runtime.sendMessage({ type: "GET_USD_RATE" }, (response) => {
  if (chrome.runtime.lastError) {
    setError("Ошибка запроса");
    return;
  }

  if (!response?.ok || !response?.rate) {
    setError("Курс недоступен");
    return;
  }

  rateElement.textContent = Number(response.rate).toFixed(4);
});
