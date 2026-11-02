SYNVIO V11 FIX — FLOW

Repo docelowe: flowsynviocore-main.
Paczka aktualizacyjna: zachowaj wszystkie pozostałe pliki repo.
Wgraj zawartość tego katalogu do katalogu głównego właściwego repo, nadpisując te same ścieżki. Nie wgrywaj całego katalogu FLOW jako podkatalogu.

Kolejność wdrożenia: 1. APP, 2. FLOW, 3. MARKETING.
Aktualizacja bazuje na zaakceptowanym FLOW V8, logo V9 i marketingówce V10.
Nie zawiera zmian SQL ani nowych zmiennych środowiskowych. Zakłada istniejące migracje FLOW i Instagram.
Po wdrożeniu odśwież przez Ctrl+Shift+R.

Naprawy FLOW:
- Przyciski Disconnect Instagram i Refresh status w Connections.
- Status opisuje wygaśnięcie autoryzacji, brak publikacji lub połączenia Workspace.
- Widget wyświetla **pogrubienie**, __pogrubienie__, kod w pojedynczych backtickach i bezpieczne linki. Treść AI nie jest wykonywana jako HTML.
- Przycisk uruchamiania czatu nie zasłania otwartego okna. Projektant nadal pokazuje oba elementy.
- Zachowany rework V8, podgląd Instagrama i logo V9.

Sprawdzenie po wdrożeniu wszystkich trzech paczek:
1. FLOW → asystent Instagram → Connections → Refresh status.
2. Sprawdź, czy asystent jest opublikowany. Połączenie z Workspace jest wymagane, jeśli rozmowy mają być widoczne zespołowi.
3. Jeśli autoryzacja wygasła lub chcesz ją odnowić, rozłącz i połącz konto przez nowe przyciski. Sam błąd długości identyfikatora nie wymaga ponownej autoryzacji.
4. Wyślij NOWĄ wiadomość z innego konta Instagram. Stare zdarzenia nie są automatycznie odtwarzane, aby nie wysłać powtórnych odpowiedzi.
5. Sprawdź odpowiedź na Instagramie oraz AI handled w Workspace. Przy dostępnym zespole i włączonym handoffie sprawdź także prośbę o człowieka.
6. Marketing → Talk to AI: przy konfiguracji floating ma otworzyć okno bez wymuszonego przyciemnienia strony.

Weryfikacja lokalna: odtworzenie starego błędu długich ID, zapis wiadomości i wywołanie AI, handoff, duplikaty, błędy zapisu, uprawnienia do botów, CORS, rozłączenie; testy przeglądarkowe FLOW, Workspace i marketingówki oraz pogrubień.
Transport Meta/AI i baza były symulowane w testach. Publiczne pliki i nagłówki wdrożonej strony sprawdzono tylko do odczytu. Nie wysyłano prawdziwych DM ani płatnych zapytań AI. Nie wykonano wdrożenia i nie potwierdzono jeszcze całej ścieżki na prawdziwym koncie Instagram.

Jeśli nowy DM nadal nie przechodzi: sprawdź log instagram_routing_error (stage/code), instagram_routing (accepted/ignored/failed) i instagram_webhook (routed/routingFailed/unmapped). Dalsza diagnoza wymaga aktualnego zdarzenia z wdrożenia; nie przesyłaj tokenów ani sekretów.
