# Aktualizacja V20
1. Najpierw uruchom supabase/flow_v20.sql w SQL Editor wspólnej bazy Supabase. Wymaga wcześniejszej migracji Flow V18. Uruchom tylko raz dla obu aplikacji (skrypt jest powtarzalny).
2. Wgraj zawartość paczki Flow do repo Flow, Workspace do repo Workspace i wykonaj deployment obu.
3. Nie zmieniaj sekretów ani DNS. Marketing V19 pozostaje aktualny.

Flow startuje listą agentów. New agent otwiera formularz nazwy. Open otwiera edytor. Usunięcie wymaga potwierdzenia i wyłącza bota oraz klucze; dane rozmów są zachowane. Otwarte rozmowy ludzkie i oczekujące odpowiedzi trzeba najpierw zakończyć.
Asystent budowania jest pod przyciskiem Flow Assistant w prawym panelu. Zna mapę panelu, bieżącą sekcję i zapisane ustawienia bota. Odpowiedzi AI obciążają portfel. Asystent doradza, nie wykonuje samodzielnie zmian.
Usunięto komunikaty sukcesu Flow, wiedzy i powiadomienia sukcesu Inbox. Błędy oraz wymagane potwierdzenia usuwania, nadpisania treści i zgody na opłaty pozostają. Workspace nie odtwarza animacji przejść.
