FLOW UPDATE — INSTAGRAM CONNECTIONS + MARKETING EMBED

Replace these matching files in the FLOW repository:

  js/flow-widget.js
  js/flow-studio.js
  assets/flow.css

Then deploy FLOW.

What is included
----------------
1. Instagram agents now show a Disconnect Instagram button only while an active
   Instagram connection exists. It asks for confirmation and safely removes
   the encrypted connection token from the central integration.
2. Widget design is hidden for Instagram agents. Website-chat agents keep the
   full Widget design area unchanged.
3. The public widget supports data-no-launcher="true". This is used only by
   the marketing page so its own Talk to AI buttons open the chat without a
   flashing floating launcher. Normal customer embeds remain unchanged.

After FLOW is deployed, upload the matching marketing v16 package and deploy
the marketing website.
