Repo docelowe: flowsynviocore-main

SYNVIO V12 — liczniki, ładowanie kolejki i wiadomości z numerem zgłoszenia

Paczki aktualizacyjne dla wersji V11. Wgraj pliki z właściwej paczki do katalogu głównego odpowiedniego repo, zachowując ścieżki i pozostałe pliki. Nie zastępuj całego repo samą zawartością paczki.

KOLEJNOŚĆ
1. W Supabase SQL Editor wspólnej bazy APP/FLOW uruchom cały plik inbox_counts_v12.sql (jest również w APP/supabase). Zmienia funkcję liczącą kolejki i dodaje indeks. Nie usuwa rozmów. Można uruchomić ponownie.
2. Podmień pliki APP i wdroż aplikację.
3. Podmień pliki FLOW i wdroż aplikację.
4. Odśwież otwarte karty przez Ctrl+Shift+R.
5. FLOW → wybrany asystent → Conversation → Ticket messages. Ustaw treści, następnie Save draft i Publish w Publish & API.

FORMUŁKI
- Opening ticket message: np. „Cześć! Numer Twojego zgłoszenia to #{ticket_number}. W czym mogę pomóc?”
- Confirmed handoff message: np. „Rozmowa została przekazana do zespołu. Numer zgłoszenia: #{ticket_number}. Pracownik odpowie tutaj.”
- {ticket_number} pochodzi z bazy, {assistant_name} z konfiguracji asystenta. Brak pola numeru w formułce powoduje dopisanie prawdziwego numeru.
- Puste treści używają automatycznej wersji polskiej/angielskiej. Własna formułka jest wysyłana dosłownie, po podmianie pól.
- Checkbox pozwala wyłączyć początkową wiadomość z numerem; domyślnie jest włączona. Potwierdzenie przekazania pozostaje aktywne.
- W Instagramie formułka początkowa trafia po pierwszej wiadomości klienta w NOWEJ rozmowie, przed odpowiedzią AI. Na stronie przy utworzeniu sesji. Nie jest dopisywana wstecz do starych rozmów.
- Pytanie o numer działa również po przekazaniu do pracownika. Zwykłe wiadomości po przekazaniu nie wywołują AI.

CO ZMIENIONO
- Inbox liczy wszystkie dostępne aktywne rozmowy: e-mail oraz AI/człowiek w czacie i Instagramie. AI handled jest podzbiorem Inbox; dla przykładu 3 zwykłe + 5 AI daje Inbox 8, AI handled 5.
- Licznik AI pochodzi z bazy niezależnie od aktualnej zakładki, a późne utworzenie przycisku nie zeruje go.
- Kolejki e-mail i czatu są pobierane równolegle. Lista nie czeka na otwartą rozmowę. Odświeżanie czatu nie uruchamia dodatkowo odczytu wątku e-mail.
- Przełączenie między już pobranym Inbox i AI handled filtruje dane od razu; istniejące odświeżanie w tle nadal aktualizuje stan.
- Backend równolegle pobiera niezależne dane kolejki i nie przesyła całej bazy wiedzy botów z każdym odświeżeniem.
- Instagram wysyła i zapisuje potwierdzenie po udanym przekazaniu. Obsługiwana jest prośba „możesz przekazać rozmowę do zespołu teraz, jaki mam numer ticketu?”.
- Numer w odpowiedziach pochodzi z bazy. AI dostaje również ten numer jako kontekst, bez prawa do jego wymyślania.
- Dostępność zespołu i uprawnienia do rozmów pozostają sprawdzane. Nie zmieniono tokenów Meta, konfiguracji kont ani rozliczeń.

SPRAWDZENIE PO WDROŻENIU
1. Otwórz Inbox: porównaj liczniki z rozmowami. Kliknij AI handled i wróć do Inbox.
2. Opublikuj formułki wybranego asystenta. Zespół musi być dostępny, Workspace połączony, a tryb musi pozwalać na przekazanie.
3. W nowej rozmowie Instagram sprawdź początkowy numer. Poproś o przekazanie i zapytaj o numer: potwierdzenie powinno być na Instagramie i w Workspace, z tym samym numerem.
4. Zapytaj ponownie o numer po przekazaniu. Następnie sprawdź analogiczną rozmowę na stronie.

WERYFIKACJA
Lokalne testy PostgreSQL: liczniki, uprawnienia, brak podglądów testowych, rozłączone/usunięte boty i ponowne wykonanie migracji.
Testy backendu: rzeczywiste sformułowanie ze screena, wysłanie/zapis potwierdzenia, numer przed/po przekazaniu, brak duplikatów, brak fałszywego potwierdzenia po błędzie, zapis/publikacja ustawień.
Testy przeglądarkowe: Inbox 8 / AI handled 5, natychmiastowe przełączanie, równoległe pobieranie, ustawienia FLOW, formatowanie i pływający widget.
AI, Meta i usługi sieciowe były zastąpione danymi testowymi. Nie wysłano prawdziwych DM ani płatnych zapytań AI. Nie wykonano wdrożenia. Czas odpowiedzi produkcyjnej bazy/Meta wymaga sprawdzenia po podmianie.

Marketingówka nie wymaga nowej paczki. Dotychczasowy Talk to AI pobiera widget z FLOW i zachowuje opublikowany format okna.
