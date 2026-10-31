# Flow V21
Wgraj zawartość tej paczki do repo Flow i wykonaj deployment. Workspace V20 i marketing V19 pozostają bez zmian. Wymagana wcześniejsza migracja flow_v20.sql; V21 nie dodaje nowej migracji.

Flow Assistant jest na górze po prawej, obok Save draft. Otwiera prawy panel rozmowy. Zna zapisane ustawienia i bieżącą sekcję; pamięta do 6 ostatnich wiadomości przekazywanych w bieżącej rozmowie. Nie zapisuje ani nie publikuje zmian za użytkownika. Odpowiedzi korzystają z API OpenAI i wspólnego portfela. Zapisz draft, jeśli chcesz omawiać najnowsze ustawienia.

## Bot na innej stronie
1. Utwórz agenta, wpisz instrukcje i wiedzę, zapisz.
2. Test bot pozwala sprawdzić odpowiedzi (zużywa saldo AI).
3. Publish & API → Allowed websites: wpisz dokładne adresy HTTPS stron, np. https://sklep.pl oraz osobno https://www.sklep.pl. Bez ścieżek. Zapisz i kliknij Publish saved draft.
4. Copy embed → wklej kod przed końcem body na stronie. Nie wstawiaj kluczy API do HTML. Przy formacie Embedded section dodaj też wskazany div.
5. Otwórz stronę i kliknij przycisk czatu. W razie restrykcyjnego CSP strona musi zezwalać na skrypt i połączenia do https://flow.synviocore.xyz oraz style widgetu. Kreatory stron mogą wymagać opublikowania zmian, by wykonać skrypt.
6. Human handoff wymaga Connect Workspace i odpowiedniego trybu przed publikacją.

Weryfikacja: lokalny test na osobnym originie strony, otwieranie/zamykanie, odpowiedź testowego API, ponowienie przerwanej odpowiedzi z tym samym requestId, rozmiar mobilny, test edytora i asystenta. Dostawca AI był symulowany; faktyczna odpowiedź OpenAI wymaga poprawnego OPENAI_API_KEY, salda i wdrożenia. Nie wykonano deploymentu produkcji.
