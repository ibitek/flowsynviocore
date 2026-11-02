SYNVIO / FLOW — REWORK V8

To jest aktualizacja repo FLOW: 7 kompletnych plikow do podmiany.
NIE jest to cale repo. Nie usuwaj pozostalych plikow.

Wdrozenie:
1. Zachowaj kopie obecnej wersji repo FLOW.
2. Skopiuj index.html oraz katalogi assets, js i lib z paczki do glownego
   katalogu repo FLOW, nadpisujac tylko pliki o tych samych sciezkach.
3. Wdrozenie musi objac frontend i funkcje serwerowa korzystajaca z lib/flow.js.
4. Po wdrozeniu odswiez strone bez pamieci podrecznej (Ctrl+Shift+R).

Paczka nie zmienia bazy danych i nie wymaga SQL, nowych zmiennych srodowiskowych
ani ponownego podlaczania kont. Zachowaj obecne pliki .env, konfiguracje wdrozenia,
pozostale biblioteki i funkcje API.

Zawartosc:
index.html
assets/flow-rework-v2.css
js/flow-rework-v1.js
js/flow-theme.js
js/flow-studio.js
js/commerce-client.js
lib/flow.js

Zmiany:
- Grafitowy i jasny motyw, zgodna paleta paneli i formularzy.
- Menu o stalej wysokosci okna, niezalezne przewijanie, pojedyncze ikony SVG.
- Oddzielne sekcje Instagram, Workspace i Commerce oraz przycisk Open Commerce.
- Dla Instagram DM brak Widget design, domeny strony i kodu osadzania.
- Podglad testowy IG w stylu DM, bez dodatkowego przycisku Chat.
- Flow Assistant obok edytora: formatowane odpowiedzi, listy, bloki tekstu/kodu,
  kopiowanie, propozycje zmian z zatwierdzeniem i cofaniem.
- Serwer przekazuje asystentowi rzeczywisty kanal wybranego bota.
- Okno nowego agenta bez poziomego suwaka, takze na telefonie.

Walidacja:
Testy przegladarki 320-1440 px: zmiana motywu, przewijanie, podglad IG,
wyslanie wiadomosci do testowego API, kopiowanie, propozycje/apply/undo,
zachowanie edytora widgetu dla kanalu web.
Test prawdziwego handlera ze sztuczna baza i odpowiedzia AI: kanal z serwera
ma pierwszenstwo przed danymi przegladarki; brak dostepu miedzy organizacjami;
brak dostepu do asystenta dla nieadministratora. Kontrola skladni JS.

Testy byly lokalne, z symulowanymi uslugami. Nie potwierdzaja dzialania OAuth,
realnych DM ani konfiguracji produkcyjnej Commerce. Paczka nie zawiera zmian
marketingu, Workspace ani backendu Commerce.

Baza plikow: synvio-commerce-integration-full-v6/flowsynviocore-main.
W archiwum nie ma starych paczek, zaleznosci node_modules, bazy ani sekretow.
