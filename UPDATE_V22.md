# V22 — Designer, decision trees and shared inbox

## Wdrożenie
1. Wspólna baza musi mieć migracje Flow V18 oraz flow_v20.sql. Jeśli ich nie wykonywano, wykonaj je w tej kolejności.
2. Następnie uruchom supabase/flow_v22.sql w tej samej bazie. Wystarczy raz dla obu repo.
3. Wgraj paczkę Flow V22 do repo Flow, a Workspace V22 do repo app i wykonaj oba deploymenty. Nie zmieniaj DNS ani kluczy.
4. Zapisz i ponownie opublikuj boty, aby nowe opcje znalazły się w wersji live. Zmiany draft nie zmieniają opublikowanego widgetu.

## Widget design
Logo z HTTPS lub upload PNG/JPEG/WebP do 64 KB (zapisane w konfiguracji), rozmiar logo, font i jego rozmiar, tło i tekst AI/klienta, nagłówek, wpisywanie, placeholder, przyciski, launcher, obramowania, zaokrąglenia, pozycje i rozmiar okna. Podgląd odświeża się podczas edycji. Logo z zewnętrznego URL musi być publicznie dostępne. Własny CSP witryny musi zezwalać na obraz lub data:image dla uploadu.

## Decision trees
Edytor węzłów i połączeń przyciskami (nie przeciągany canvas). Węzeł wejściowy rozpoznaje słowa kluczowe; pierwsza pasująca reguła wygrywa. Ustaw dokładną odpowiedź, opcjonalne przyciski kierujące do kolejnych ID i dostępność Always / Handoff ON / Handoff OFF. Węzły potomne mogą mieć wyłączoną opcję Start here. Gotowe odpowiedzi nie wywołują modelu i nie naliczają tokenów AI. Niepasująca wiadomość trafia do AI. Pusta lub niepasująca gałąź nie zastępuje prawidłowych instrukcji.

## Human handoff
Po Connect Workspace przełącznik w Connections jest dostępny. OFF odpowiada AI only, ON odpowiada AI + human; human-only można wybrać z listy trybów. Zapisz i opublikuj, aby zastosować. Przy OFF bot nie deklaruje przekazania; dla prośby o człowieka podaje skonfigurowany kontakt e-mail. W gałęziach wpisuj odpowiedzi właściwe dla wybranej dostępności — gotowy tekst jest wysyłany dokładnie tak, jak zapisano.

## Workspace
Główna kolejka zawiera email oraz czaty wymagające człowieka z oznaczeniem kanału. Chat otwiera się w tym samym panelu rozmowy, z odpowiedzią i Resolve. Dawna strona flow-inbox przekierowuje do głównego inboxa. Czyste rozmowy AI nie trafiają do kolejki. Handoff OFF ukrywa kolejkę danego bota, nie usuwa historii. Czaty rozwiązane są dostępne w Resolved. Na razie lista czatu pobiera do 500 rozmów; nie ma przypisywania czatów konkretnemu pracownikowi, załączników czatu ani wspólnej paginacji z mailami. TikTok nie jest podłączony — ta wersja nie odbiera jego wiadomości.

## Weryfikacja
Testy bazy: rozliczenia, izolacja organizacji, deterministyczne gałęzie bez wywołań AI, fallback kontaktowy, odfiltrowanie AI-only. Testy przeglądarki: projektant, edytor węzłów, wspólna kolejka email/chat, odpowiedź pracownika. Usługi zewnętrzne były symulowane; zweryfikuj na własnej domenie po deploymentach.
