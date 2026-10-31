# SYNVIO V28 — aktualizacja istniejącej instalacji V27

Paczki nie są wdrożone na produkcję. Zawierają kompletną zawartość aplikacji; folder sources pozostaje niezmieniony.

## Kolejność
1. Wykonaj kopię bazy Supabase i zachowaj poprzednie wdrożenia aplikacji.
2. Wspólna baza musi już mieć migracje V25 oraz flow_v27.sql i flow_v27_5.sql. Jeśli używasz działającej wersji V27.6, te warunki powinny być spełnione. To aktualizacja, nie instalator pustej bazy.
3. W Supabase → SQL Editor uruchom cały plik UPDATE_V28.sql z ZIP-a SQL. Robisz to raz dla wspólnej bazy Flow i Workspace. Skrypt zawiera, w kolejności: team, permissions, availability, knowledge, bot_limits, analytics. Nie uruchamiaj później starszych migracji, bo nadpiszą nowe zabezpieczenia. Powtórne wykonanie V28 przeszło test.
4. Wgraj zawartość Workspace_DO_REPO.zip do repo Workspace oraz Flow_DO_REPO.zip do repo Flow. Pliki mają być w głównym katalogu repozytorium, bez dodatkowego folderu ZIP. Zachowaj dotychczasowe zmienne środowiskowe i konfigurację Supabase. Nie wymieniaj klucza szyfrowania BYOK.
5. Wdróż oba projekty i odśwież Ctrl+F5. Marketing nie wymaga zmian dla tej aktualizacji.

## Nowe funkcje
- Admin → Team → Permissions: dostęp do konkretnych skrzynek i botów oraz zezwolenie na zmianę dostępności zespołu. Dotychczasowi członkowie zachowują dostęp do wszystkich zasobów, dopóki administrator go nie ograniczy. Administratorzy mają pełny dostęp.
- Remove access usuwa członkostwo w firmie, nie wspólne konto użytkownika. Zwalnia przydzielone rozmowy i zachowuje historię. Nie można usunąć własnego członkostwa przez ten przycisk.
- W Workspace nad listą rozmów jest przełącznik dostępności dla uprawnionych osób. Dostępność, harmonogram i opublikowany tryb bota wspólnie określają możliwość nowych przekazań. Istniejące rozmowy z pracownikiem pozostają aktywne. Jest to sterowanie dostępnością zespołu, a nie dowolne uprawnienie pracownika do edycji konfiguracji AI.
- Bot może zgłosić rzeczywisty brak możliwości obsługi problemu; serwer sprawdza aktualną dostępność i przekazuje sprawę albo podaje skonfigurowany kontakt. Losowy tekst i pytania poza zakresem nie powinny wywoływać przekazania. Trafność decyzji zależy od modelu i wymaga prób na pytaniach klientów.
- Flow Assistant → Propose draft edits / decision tree: propozycja zmian, widok Before/After, Apply to draft i Undo. Zmiany nie publikują się same. Save → Publish dopiero po sprawdzeniu. Asystent widzi niezapisany szkic. Generuj większe drzewa etapami: niekompletny lub błędny wynik jest odrzucany bez nadpisania wiedzy.
- Knowledge: 100 tys. znaków, pobieranie tekstu, zapisane wersje wiedzy i drzewek jako JSON. Oryginalne pliki źródłowe nie są przechowywane osobno. Pełny tekst zapisanej wiedzy zostaje w historii; zbyt długi zapis jest odrzucany. Nie jest to indeks wyszukiwania ani cache AI. Bardzo duży kontekst może przekroczyć istniejący budżet zapytania; wtedy AI zwróci błąd zamiast cicho skracać wiedzę.
- Decision trees: eksport i import JSON; wygenerowane reguły działają po zapisaniu i publikacji. Samo wygenerowanie drzewka nie gwarantuje poprawności odpowiedzi.
- Activity & team: rozmowy, aktualna kolejka i przydziały, odpowiedzi pracowników, średnia pierwsza odpowiedź, przekazania, użycie drzewek, koszty i ostatnie rozmowy bez treści. Okresy 7/30/90 dni. Nie przedstawiamy tych liczb jako pomiaru jakości czy czasu pracy.
- Domyślnie 10 aktywnych botów na firmę, egzekwowane w bazie. To limit botów, nie pracowników. Wyjątki operator może ustawić w flow_limits_v28; zakres 1–100. Usunięty/archiwalny bot nie zajmuje miejsca.
- Setup assistant zajmuje własną kolumnę, na małym ekranie układa się pod treścią. Pola DNS, adres przekierowania i cały temat testu kopiują się bez dodatkowych tabulatorów i nowych linii. Verify/Refresh pokazują postęp i wynik.
- Import obrazów do Flow Assistant nie został dodany. Pozostaje tekst/kod i istniejące logo; nie obiecujemy analizy zdjęć przez dowolny model BYOK.

## Krótki test po wdrożeniu
1. Jako administrator ogranicz pracownika do jednej skrzynki i jednego bota. Jako pracownik sprawdź listę, przejęcie, odpowiedź i zwolnienie rozmowy; niedozwolone zasoby mają być niedostępne. Wyłącz dostępność i sprawdź nowy czat.
2. W widżecie poproś po polsku i angielsku o człowieka, a następnie dopisz wiadomość podczas oczekiwania. Potwierdź obecność w kolejce Workspace i brak dalszych odpowiedzi AI.
3. Sprawdź problem wymagający rzeczywistego działania (np. rozpatrzenia zwrotu) oraz losowy tekst; przetestuj również handoff OFF i godziny poza harmonogramem. Uzupełnij prawdziwy email/telefon kontaktowy.
4. Zmień wiedzę przez asystenta, obejrzyj propozycję, zastosuj i cofnij. Zapisz wersję, pobierz poprzednią, przetestuj drzewko w Test bot przed Publish.
5. Sprawdź kolejno Take ownership, Send reply, Release, Resolve. Zamknięta rozmowa nie służy do dalszego odpowiadania; zwolnienie przypisania nie otwiera jej ponownie.
6. Postmark: Connected potwierdza odbiór, nie wysyłkę. Po zatwierdzeniu konta wyślij odpowiedź z Workspace, sprawdź doręczenie i odpowiedź klienta w tym samym wątku. Nie traktuj FAILED w historii jako wysłanej wiadomości.

## Weryfikacja wykonana lokalnie
33 testy jednostkowe; pełny zestaw bazy PGlite z rozliczeniami, uprawnieniami, wersjami wiedzy, limitem botów i analityką; testy Edge dla konfiguracji poczty, edytora Flow (w tym Apply/Undo) i analityki desktop/mobile; kontrola składni79 plików JS. Wywołania dostawców były symulowane: nie wykonano płatnej oceny modeli ani produkcyjnej wysyłki maili.

Rozliczanie AI pozostaje istniejącą ścieżką rezerwacji i rozliczenia; BYOK nie nalicza opłaty AI SYNVIO, ale zachowuje opłaty kanałów. Płatności nadal mają dotychczasowy tryb testowy; ta aktualizacja nie dodaje płatności kartą.
