Aktualizacja V13 dla APP i FLOW z V12

1. W Supabase SQL Editor wspólnej bazy uruchom cały plik workspace_v13.sql. Skrypt jest transakcyjny i można go uruchomić ponownie.
2. Rozpakuj archiwum APP w katalogu głównym repo APP, podmień pliki pod tymi samymi ścieżkami i wdroż APP.
3. Tak samo podmień pliki i wdroż FLOW. Archiwa są aktualizacjami istniejących repozytoriów.
4. W FLOW otwórz asystenta, Conversation → Conversation routing & spam protection. Zapisz szkic i opublikuj zmiany.

Domyślnie Inbox pokazuje e-mail i rozmowy zespołu. AI handled pokazuje rozmowy prowadzone przez AI. Take ownership przenosi aktywną rozmowę do Inbox i pokazuje imię pracownika. Przy trwającej wysyłce można ponowić przejęcie po jej zakończeniu.

Send incoming Instagram DMs straight to the team Inbox kieruje nowe wiadomości do kolejki zespołu bez czekania na odpowiedź AI. Wymaga połączonego Workspace.

Ochrona antyspamowa domyślnie pozwala na 6 wiadomości w ciągu 10 sekund. Siódma kończy rozmowę. Powtarzający się obraźliwy spam całkowicie poza tematem również może zakończyć rozmowę. Domyślna blokada trwa minutę. Można ustawić od 1 do 60 minut, zmienić próg szybkości lub wyłączyć ochronę. Dla Instagramu blokada dotyczy nadawcy u danego asystenta. Dla czatu na stronie dotyczy identyfikatora przeglądarki.

Po wdrożeniu wyślij nową wiadomość z konta klienta. Jeżeli Workspace pokaże META_TOKEN_EXPIRED, otwórz FLOW → Connections → Reconnect Instagram. Nowa autoryzacja pobiera token długoterminowy. W przypadku innego błędu szczegóły diagnostyczne dla konkretnego zgłoszenia znajdują się w polach failure_stage i failure_code w instagram_message_deliveries. Starsze zdarzenia z poprzedniej wersji nie są wysyłane ponownie.

Testy lokalne objęły migrację PostgreSQL, przejęcie przy równoczesnej wysyłce, osobne kolejki i liczniki, prywatne pytania Copilota, uprawnienia, odpowiedzi IG, ponowienie po limicie Meta, wiadomości o przekazaniu, ochronę przed spamem i zapis ustawień. Potwierdzenie rzeczywistej dostawy przez Meta wymaga nowej wiadomości po wdrożeniu.

