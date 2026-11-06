# Flow API — V18

`POST https://flow.synviocore.xyz/api/flow`. JSON, HTTPS, maksymalnie 40 KB.

## Integracja serwerowa

Wygeneruj klucz **Flow** w Publish & API. Należy do jednego bota. Przechowuj jako zmienną serwera `SYNVIO_FLOW_KEY`. Nie umieszczaj w przeglądarce, logach ani publicznym repo. Cofnięty klucz blokuje nowe i istniejące sesje serwerowe.

```js
const endpoint = 'https://flow.synviocore.xyz/api/flow';
const headers = {'content-type':'application/json',
  authorization: `Bearer ${process.env.SYNVIO_FLOW_KEY}`};
const response = await fetch(endpoint, {method:'POST',headers,
  body:JSON.stringify({action:'session',botId:process.env.SYNVIO_FLOW_BOT_ID})});
if (!response.ok) throw new Error('Session unavailable');
const {conversationId,sessionToken} = await response.json();
// Persist BEFORE sending. Reuse ID, text and session when retrying after a timeout.
const requestId = crypto.randomUUID();
const reply = await fetch(endpoint, {method:'POST',headers,
  body:JSON.stringify({action:'message',conversationId,sessionToken,requestId,
    text:'Can you explain the return policy?'})});
const result = await reply.json(); // {reply,state} or {error,code}
```

`action:"messages"` z conversationId/sessionToken zwraca `{state,messages}`. Role: user, assistant, agent, system. `action:"handoff"` prosi o pracownika połączonego Synvio Workspace (hybrid).

Klient serwerowy nie wysyła Origin. Publiczny widget używa dozwolonego Origin i tokenu własnej sesji zamiast klucza API. Instrukcje i wiedza bota nie są zwracane przez publiczne `config`.

## Studio i Workspace

`Authorization: Bearer <Supabase access token>`. Nigdy secret/service key w przeglądarce.

Admin: list, create, save, publish, offline, connect, keys, key, revoke, assistant. Operacje save/publish/offline/connect wymagają botId i aktualnego revision. Konflikt wersji: 409. Tylko publish kopiuje draft do live.

Członkowie Workspace: inbox, thread, reply, resolve. Wszystkie rozmowy są sprawdzane względem firmy użytkownika. Reply wymaga UUID requestId i text. Odpowiedź trafia do czatu, nie na email.

`session` z `preview:true` wymaga administratora i używa zapisanego draftu. AI jest rozliczane tak samo jak opublikowany bot. Rozwiązuj testowe rozmowy ludzkie po testach.

## Błędy

- 400: błędne dane/tryb/origins.
- 401: sesja wygasła, nieprawidłowy token lub cofnięty klucz.
- 402: portfel/plan nie pokrywa AI.
- 403/404: brak uprawnień, niedozwolona strona lub niedostępny bot.
- 409 REQUEST_PENDING: poprzednie żądanie trwa — ponów jego ID.
- Inne 409: konflikt revision/requestId/stanu rozmowy.
- 413: rozmiar/budżet tokenów przekroczony.
- 429: limit IP/sesji/bota.
- 503 RECONCILIATION_REQUIRED: wynik dostawcy nieznany; środki zarezerwowane do wyjaśnienia, nie generuj nowego ID.

Niekompletna odpowiedź jest rozliczana za faktyczne tokeny, zapisana jako błąd i nie udaje udanej odpowiedzi. Human-only nie wywołuje AI. Klucz Flow nie jest gotowym konektorem Zendesk/Intercom i nie pozwala administrować Workspace.

Dokumentacja dostawcy: [token counting](https://developers.openai.com/api/docs/guides/token-counting), [Responses](https://developers.openai.com/api/docs/guides/text).
