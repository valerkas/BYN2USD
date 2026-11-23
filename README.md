# BYN to USD Chrome Extension

Расширение для Chrome, которое показывает рядом с ценами в рублях на [av.by](https://av.by) и [re.kufar.by](https://re.kufar.by) их эквивалент в долларах по официальному курсу НБРБ.

[Страница в Chrome Web Store](https://chromewebstore.google.com/detail/cibbmokbaeaojnpijhckhobhlaliabil)

## Что делает

- Берёт курс доллара с сайта НБРБ
- Добавляет к ценам на av.by и в объявлениях о недвижимости на Куфаре сумму в долларах, например `~$311.52`.
- По клику на иконку показывает текущий курс.

## Пример

Было:

`Цена: 1 000 руб`

Стало:

`Цена: 1 000 руб`  
`~$311.52`  
(пример, зависит от текущего курса НБРБ)

## Приватность

Расширение не собирает и не передаёт никаких данных. Единственный внешний запрос — получение курса с сайта НБРБ.

## Установка из исходников

1. Откройте `chrome://extensions`.
2. Включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение**.
4. Выберите папку репозитория.

## Разработка

- Сборка zip для публикации: `.\scripts\package.ps1`, архив загружается в [Developer Dashboard](https://chrome.google.com/u/1/webstore/devconsole/4b38568b-3ddd-4385-8069-f42fb2079e5b/cibbmokbaeaojnpijhckhobhlaliabil/edit/package).
- Проверка на живых сайтах: `npm run test:production` (подробности в [`tests/production-smoke.md`](tests/production-smoke.md)).
