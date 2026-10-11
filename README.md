# Synvio Flow — osobne repo dla flow.synviocore.xyz

Ta paczka jest osobnym frontendem i backendem Flow. Kreator otwiera się na `/`.
Nie zastępuje repo Workspace ani strony marketingowej. Korzysta z istniejącej bazy Synvio (V17 + migracja Flow), a nie z pustego projektu Supabase.

## Wdrożenie
1. Rozpakuj ZIP i wrzuć jego zawartość bezpośrednio do głównego katalogu nowego repo. `package.json`, `index.html` i `vercel.json` muszą być w głównym katalogu.
2. W Vercel zaimportuj NOWE repo jako NOWY projekt. Framework Preset: Other. Root Directory: główny katalog. Bez własnej komendy budowania; Output Directory pozostaw domyślne. Instalacja zależności: domyślna (npm install).
3. Dodaj w Production te same wartości co w Workspace: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`. Do wysyłania resetów hasła dodaj też `POSTMARK_SERVER_TOKEN` i `POSTMARK_FROM_EMAIL` (zweryfikowany nadawca). Nie wklejaj sekretów do plików JS ani repo.
4. `js/config.js` zawiera publiczny adres i publiczny klucz dotychczasowego Supabase. Muszą odpowiadać temu samemu projektowi co zmienne backendu. Publiczny klucz może być w repo; secret key nigdy.
5. W tej samej bazie Supabase uruchom `supabase/flow_migration.sql`, jeśli migracja V18 nie była wykonana. Jest powtarzalna. Nie uruchamiaj na pustej bazie: wymaga istniejących tabel kont, organizacji i rozliczeń Synvio.
6. W Supabase Authentication → URL Configuration dodaj do Redirect URLs: `https://flow.synviocore.xyz/**`. Zachowaj dotychczasowe adresy Workspace i jego Site URL. Ta aplikacja przekazuje własny adres powrotu przy rejestracji i resecie.
7. W nowym projekcie Vercel → Domains dodaj `flow.synviocore.xyz`. Jeśli jest przypisana do starego projektu, przenieś tylko tę subdomenę. `app.synviocore.xyz` zostaje przy Workspace.
8. W Spaceship ustaw rekord CNAME dla hosta `flow`, z wartością dokładnie wskazaną przez nowy projekt Vercel. Nie zmieniaj rekordów poczty, `app` ani domeny głównej.
9. Wykonaj deployment po dodaniu zmiennych. Otwórz https://flow.synviocore.xyz/ i zaloguj się dotychczasowym kontem administratora.

## Test po wdrożeniu
- Zaloguj się, utwórz asystenta, dodaj instrukcje i wiedzę, zapisz, uruchom Test. Prawdziwy test AI korzysta ze wspólnego portfela.
- Dodaj dokładny adres strony do Allowed websites, np. `https://synviocore.xyz`, opublikuj i wstaw wygenerowany embed na tę stronę.
- Sprawdź reset hasła na własnym koncie (wymaga poprawnego Postmark).
- Dla human handoff zainstaluj również wersję V18 Workspace w istniejącym repo app. W Flow kliknij Connect i wybierz tryb AI + human handoff. Odpowiedzi pracowników są w `https://app.synviocore.xyz/flow-inbox.html`.

## Wspólne konta i integracja
Ta sama baza oznacza te same konta, organizacje i saldo. Sesje przeglądarki są osobne dla subdomen: może być potrzebne ponowne logowanie tym samym hasłem. Studio jest dla administratorów. Pracownicy odpowiadają przez Workspace.

Endpoint tej paczki: `/api/flow`. Starsze wywołania `/api/wallet?flow=1` są przekierowywane wewnętrznie do Flow dla zgodności z wcześniejszym widgetem marketingowym. Portfel i jego ustawienia są w Workspace.
Opcjonalne `FLOW_MARKETING_BOT_ID` wskazuje opublikowanego bota dla integracji marketingowej. Klucze bota są przeznaczone do integracji serwerowej, nigdy do kodu strony.

## Zakres i ograniczenia
Zawiera kreator, wiedzę, projektant widgetu, test AI, publikację, embed, klucze API, połączenie z Workspace i asystenta konfiguracji. Płatne operacje korzystają z istniejącego systemu rozliczeń Synvio. Human handoff wymaga Workspace V18.
Wyszukiwanie internetu, załączniki odwiedzających, natywne integracje handoff Zendesk/Intercom/Freshdesk i edytor grafu połączonych węzłów nie są zaimplementowane. Kontekst rozmowy obejmuje ostatnie 8 wiadomości; nie ma jeszcze automatycznych streszczeń.
Paczka została przygotowana do wdrożenia; samo pobranie ZIP nie zmienia produkcji ani DNS.
