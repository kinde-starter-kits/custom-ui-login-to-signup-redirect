"use server";

import { Widget } from "../../../../components/widget";
import {
  getKindeNonce,
  getKindeRegisterUrl,
  type KindePageEvent,
} from "@kinde/infrastructure";
import React from "react";
import { renderToString } from "react-dom/server.browser";
import { DefaultLayout } from "../../../../layouts/default";
import { Root } from "../../../../root";

// Kinde uses different field ids depending on the configured auth identifier:
// `p_email_username` for email-or-username login, `p_email` for email-only.
// We match either plus a data-attribute fallback in case ids change.
const NO_ACCOUNT_ERROR_SELECTOR = [
  "#sign_up_sign_in_credentials_p_email_username_error_msg",
  "#sign_up_sign_in_credentials_p_email_error_msg",
  '[id$="_p_email_username_error_msg"]',
  '[id$="_p_email_error_msg"]',
  '[data-kinde-control-associated-text-variant="invalid-message"]',
].join(", ");
// Kinde returns different copy for the "unknown account" error depending on
// account config. Known variants:
//   - "No account found with this email"
//   - "Sorry, we don't recognise that email address or username."
// Add new phrasings here if you customize the error message in Kinde.
const NO_ACCOUNT_ERROR_TEXT_PATTERN =
  "no account found|don'?t recognise|don'?t recognize";
// Shared with the register page — do not rename without updating both pages.
const EMAIL_STORAGE_KEY = "kinde_prefill_email";

const DefaultPage: React.FC<KindePageEvent> = ({ context, request }) => {
  const nonce = getKindeNonce();
  const registerUrl = getKindeRegisterUrl();

  return (
    <Root context={context} request={request}>
      <DefaultLayout>
        <Widget heading={context.widget.content.heading} />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              // Watches for Kinde's "No account found" validation error. When it
              // appears, stashes the typed email in sessionStorage (so the register
              // page can prefill it) and navigates to the register URL.
              // sessionStorage is used because Kinde's custom-UI URLs
              // (/auth/cx/_:nav&m:register&...) aren't standard query strings, so
              // appending ?login_hint= is unreliable.
              (function () {
                var registerUrl = "${registerUrl}";
                var errorSelector = ${JSON.stringify(NO_ACCOUNT_ERROR_SELECTOR)};
                var errorTextPattern = new RegExp(${JSON.stringify(NO_ACCOUNT_ERROR_TEXT_PATTERN)}, "i");
                var STORAGE_KEY = ${JSON.stringify(EMAIL_STORAGE_KEY)};
                var EMAIL_SELECTOR =
                  'input[name="p_email_username"], input[name="p_email"], #sign_up_sign_in_credentials_p_email_username, #sign_up_sign_in_credentials_p_email, input[type="email"], input[name="email"]';
                var redirected = false;
                var lastTypedEmail = "";

                function readEmailFromDom() {
                  var input = document.querySelector(EMAIL_SELECTOR);
                  return input && input.value ? input.value.trim() : "";
                }

                function cacheEmail() {
                  var v = readEmailFromDom();
                  if (v) {
                    lastTypedEmail = v;
                    try { sessionStorage.setItem(STORAGE_KEY, v); } catch (e) {}
                  }
                }

                // Delegation on document (capture phase) — Kinde may replace the
                // form node when showing the error, so listeners bound directly to
                // the input would be lost. Capture phase ensures we see the event
                // even if Kinde's handlers call stopPropagation.
                document.addEventListener("input", function (e) {
                  var t = e.target;
                  if (t && t.matches && t.matches(EMAIL_SELECTOR)) cacheEmail();
                }, true);
                document.addEventListener("change", function (e) {
                  var t = e.target;
                  if (t && t.matches && t.matches(EMAIL_SELECTOR)) cacheEmail();
                }, true);
                // Capture on submit too — last chance to grab the value before
                // Kinde potentially clears the input during re-render.
                document.addEventListener("submit", cacheEmail, true);

                // Belt-and-braces: also append login_hint to the URL. sessionStorage
                // is the primary handoff, but if a future Kinde release honors
                // login_hint on custom-UI routes, this will already work.
                function buildRegisterUrlWithHint(email) {
                  if (!email) return registerUrl;
                  try {
                    var url = new URL(registerUrl, window.location.origin);
                    url.searchParams.set("login_hint", email);
                    return url.toString();
                  } catch (e) {
                    var sep = registerUrl.indexOf("?") === -1 ? "?" : "&";
                    return registerUrl + sep + "login_hint=" + encodeURIComponent(email);
                  }
                }

                function checkForNoAccountError() {
                  if (redirected) return;
                  var els = document.querySelectorAll(errorSelector);
                  for (var i = 0; i < els.length; i++) {
                    var text = els[i].textContent ? els[i].textContent.trim() : "";
                    if (errorTextPattern.test(text)) {
                      redirected = true;
                      observer.disconnect();
                      var email = readEmailFromDom() || lastTypedEmail;
                      if (email) {
                        try { sessionStorage.setItem(STORAGE_KEY, email); } catch (e) {}
                      }
                      window.location.href = buildRegisterUrlWithHint(email);
                      return;
                    }
                  }
                }

                // The error element is injected asynchronously after Kinde
                // validates the submission, so we observe body mutations rather
                // than checking once. characterData=true covers the case where
                // Kinde updates text inside an existing error node.
                var observer = new MutationObserver(checkForNoAccountError);
                observer.observe(document.body, {
                  childList: true,
                  subtree: true,
                  characterData: true,
                });
                cacheEmail();
                checkForNoAccountError();
              })();
            `,
          }}
        />
      </DefaultLayout>
    </Root>
  );
};

// Page Component
export default async function Page(event: KindePageEvent): Promise<string> {
  const page = await DefaultPage(event);
  return renderToString(page);
}
