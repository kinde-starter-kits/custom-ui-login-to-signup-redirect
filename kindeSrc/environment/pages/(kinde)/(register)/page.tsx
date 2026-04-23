"use server";

import {
  getKindeNonce,
  type KindePageEvent,
} from "@kinde/infrastructure";
import React from "react";
import { renderToString } from "react-dom/server.browser";
import { Widget } from "../../../../components/widget";
import { DefaultLayout } from "../../../../layouts/default";
import { Root } from "../../../../root";

// Shared with the login page's redirect script — do not rename without
// updating both pages.
const EMAIL_STORAGE_KEY = "kinde_prefill_email";

const DefaultPage: React.FC<KindePageEvent> = ({ context, request }) => {
  const nonce = getKindeNonce();

  return (
    <Root context={context} request={request}>
      <DefaultLayout isRegisterPage={true}>
        <Widget heading={context.widget.content.heading} />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              // Prefills the email input from sessionStorage, populated by the
              // login page when it redirects after "No account found". Once filled,
              // the storage entry is cleared so a later direct visit to /register
              // won't auto-fill with a stale value.
              (function () {
                var STORAGE_KEY = ${JSON.stringify(EMAIL_STORAGE_KEY)};
                var EMAIL_SELECTOR =
                  'input[name="p_email_username"], input[name="p_email"], #sign_up_sign_in_credentials_p_email_username, input[type="email"], input[name="email"]';
                var email = "";
                try { email = sessionStorage.getItem(STORAGE_KEY) || ""; } catch (e) {}
                if (!email) return;

                var filled = false;

                function fillEmail() {
                  if (filled) return;
                  var input = document.querySelector(EMAIL_SELECTOR);
                  if (!input) return;
                  // Use the native prototype setter rather than input.value = ...
                  // because React tracks a cached "last value" on the element and
                  // will ignore subsequent input events if it thinks nothing
                  // changed. Calling the native setter bypasses that cache.
                  var setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                  );
                  if (setter && setter.set) {
                    setter.set.call(input, email);
                  } else {
                    input.value = email;
                  }
                  // Fire both events so any framework listener (React onChange,
                  // plain onblur validation, Kinde's own handlers) sees the update.
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                  filled = true;
                  try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
                  observer.disconnect();
                }

                // The register widget may mount asynchronously, so we retry on
                // each DOM mutation until the input appears.
                var observer = new MutationObserver(fillEmail);
                observer.observe(document.body, { childList: true, subtree: true });
                fillEmail();

                // Hard cap so a never-mounting input doesn't leave an observer
                // running for the life of the page.
                setTimeout(function () { try { observer.disconnect(); } catch (e) {} }, 10000);
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
