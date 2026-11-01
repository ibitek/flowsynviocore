# Synvio V26 — wdrożenie

1. Wgraj pełną paczkę Flow do repo Flow, a Workspace do repo Workspace (pliki bez dodatkowego folderu nadrzędnego).
2. Wdróż oba projekty. V26 wymaga istniejącej migracji V25; nie ma nowego SQL. Nie zmieniaj kluczy ani BYOK_ENCRYPTION_KEY.
3. Po wdrożeniu odśwież panel Ctrl+F5. Workspace: /billing.html lub /pricing.html. Dodaj klucz i model, Save & enable BYOK. Use paid Synvio AI wyłącza BYOK bez usuwania klucza; Enable saved BYOK włącza go ponownie. Remove saved key usuwa go po potwierdzeniu. Ustawienie dotyczy obu aplikacji. Zapis nie potwierdza ważności klucza u dostawcy.
4. W Flow otwórz Widget design. Wybierz Desktop / Tablet / Phone. Dla telefonu/tabletu zaznacz Custom layout for this device. Ustaw rozmiar, format, pozycję, margines i wielkość tekstu. Kolory i zawartość są wspólne. Progi szerokości: telefon do 600px, tablet do 1024px, desktop powyżej 1024px. Rotate pokazuje inny rozmiar ekranu i wybiera odpowiadający mu profil szerokości.
5. Podgląd ma logiczne wymiary podane nad nim. Jest proporcjonalnie pomniejszony do miejsca w kreatorze; nie zmienia to wymiarów CSS widgetu. Dla inline podgląd reprezentuje kontener osadzenia.
6. Style → Scrollbar: kolor uchwytu, tła i szerokość. Systemy mobilne mogą automatycznie ukrywać pasek przewijania.
7. Save draft, następnie Publish. Dotychczasowy kod osadzający widget na marketingu pozostaje ten sam. Odśwież stronę. Zapis szkicu nie aktualizuje opublikowanego bota.

Zmiany: natychmiastowy dymek wysyłanej wiadomości, animowane kropki oczekiwania, zachowanie ID ponowienia i brak duplikatu po potwierdzeniu; tekst wraca do pola po znanym błędzie. Animacje respektują ograniczenie ruchu systemu. Przyciski zapisu/publikacji/kopiowania pokazują postęp i wynik, blokując podwójne wysłanie podczas operacji.

Testy lokalne: formularz BYOK w obu aplikacjach, ponowne włączenie zapisanego klucza, PostgreSQL/PGlite uprawnienia i rozliczenia, zapis profili telefonu/tabletu, porównanie geometrii preview/widget, wysyłka i błąd z symulowanym dostawcą. Nie wykonano płatnego wywołania AI ani wdrożenia produkcyjnego. Nie odtworzono zablokowanego wpisywania na zalogowanym koncie produkcyjnym; poprawiono formularz i zweryfikowano jego edycję oraz przełączanie lokalnie.
