CENTRAL APP UPDATE — INSTAGRAM DISCONNECT

Replace this matching file in the app.synviocore.xyz repository:

  lib/instagram-oauth.js

Then deploy the app project.

No SQL migration and no environment-variable changes are required.

This adds the required cross-origin response headers to the Instagram
disconnect endpoint used by FLOW. The existing secure disconnect action is
unchanged: it clears the encrypted access token and marks the connection as
disconnected.
