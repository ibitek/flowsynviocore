# V23 — wdrożenie

1. W jednej wspólnej bazie Supabase uruchom flow_v23.sql. Jeżeli nie wdrożono wcześniejszych migracji, wykonaj kolejno flow_migration.sql (V18), flow_v20.sql, flow_v22.sql, flow_v23.sql. Skrypty są w oddzielnej paczce SQL, nie trzeba umieszczać ich w repo.
2. Rozpakuj odpowiednią paczkę DO_REPO w głównym katalogu repo Flow lub Workspace. Wykonaj deployment obu projektów. Nie zmieniaj DNS i zmiennych. Zależności są w package.json.
3. W Flow ustaw Connections → godziny pracy, strefę, dni i komunikat poza godzinami. Zapisz i opublikuj bota. Bez włączonego harmonogramu zachowanie pozostaje całodobowe.
4. Pracownik w Inbox wybiera Chat lub All channels, otwiera rozmowę i klika Take ownership. Dopiero właściciel odpowiada lub rozwiązuje rozmowę. Release zwalnia rozmowę; administrator może zmienić przypisanie. Assigned to you obejmuje także czaty.

W pakiecie: poprawiony projektant z przewijanym panelem, drzewka, filtry kanału, oznaczenia nieprzeczytanych i licznik w tytule karty, odczyt per pracownik, godziny pracy i formularz kontaktowy ze zgodą. Odczyt jest oznaczany po otwarciu rozmowy. Dane kolejki odświeżają się co 10 sekund; widget co 5 sekund.

Harmonogram nie oznacza, że pracownik faktycznie jest online. Poza godzinami rozmowa trafia do kolejki i odwiedzający może zapisać kontaktowy e-mail. System nie wysyła automatycznej wiadomości e-mail. Sesja odwiedzającego wygasa po 24 godzinach; adres jest dostępny zespołowi do osobnego kontaktu. Interfejs nie obsługuje jeszcze załączników czatu i TikToka. Lista czatu pobiera do 500 rekordów; liczniki są liczone w bazie.

## Test po wdrożeniu
Dodaj docelową stronę do Allowed websites i opublikuj. Wklej embed. Przetestuj odpowiedź z wiedzy, gotowe drzewko, handoff ON/OFF, wiadomość poza godzinami, zapis kontaktu, przejęcie przez pracownika, odpowiedź i Resolve. Sprawdź koszt w portfelu. Testy lokalne sprawdziły bazę, role, przypisania, odczyt, godziny i formularz; OpenAI i zewnętrzne usługi były symulowane. Nie wykonano testu produkcyjnego ani deploymentu.
