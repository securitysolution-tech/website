// The scoping request form. With the contact backend live, the request goes to /api/contact
// (the Worker in workers/contact) and the visitor sees a confirmation. Without it, and
// whenever sending fails, the form composes the same message for the visitor's own email
// app or the clipboard instead, and nothing is sent to or stored on this site.
import { formatRequest, subjectFor, type ContactRequest } from '../data/contact';
import { contactBackend } from '../data/site';

// How long the page has been open when the visitor submits: a hint for the inbox, not a gate.
const opened = performance.now();

const messages: Record<'name' | 'email', Record<string, string>> = {
  name: {
    required: 'Enter your name, so we know who to reply to.',
    too_long: 'Use a shorter name.',
    invalid: 'Use letters, spaces and punctuation only.',
  },
  email: {
    required: 'Enter a work email address, for example you@company.ae.',
    too_long: 'That address is too long.',
    invalid: 'Enter a work email address, for example you@company.ae.',
  },
};

const FAILED = 'This could not be sent from the site just now.';
const BUSY = 'Too many requests came from your network in the last minute, so this one could not be sent from the site.';

function init(form: HTMLFormElement) {
  const email = form.dataset.to ?? '';
  const fields = {
    name: form.querySelector<HTMLInputElement>('[name="name"]')!,
    email: form.querySelector<HTMLInputElement>('[name="email"]')!,
    company: form.querySelector<HTMLInputElement>('[name="company"]')!,
    when: form.querySelector<HTMLSelectElement>('[name="when"]')!,
    message: form.querySelector<HTMLTextAreaElement>('[name="message"]')!,
  };
  const honeypot = form.querySelector<HTMLInputElement>('[name="website"]');
  const entry = form.querySelector<HTMLElement>('[data-entry]')!;
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const composed = form.querySelector<HTMLElement>('[data-composed]')!;
  const note = composed.querySelector<HTMLElement>('[data-note]');
  const mailLink = form.querySelector<HTMLAnchorElement>('[data-mailto]')!;
  const copyButton = form.querySelector<HTMLButtonElement>('[data-copy]')!;
  const preview = form.querySelector<HTMLElement>('[data-preview]')!;
  const status = form.querySelector<HTMLElement>('[data-status]');
  const sent = form.querySelector<HTMLElement>('[data-sent]');
  const sentEmail = sent?.querySelector<HTMLElement>('[data-sent-email]');
  const copyLabel = copyButton.textContent ?? 'Copy the message';
  const submitLabel = submit.textContent ?? 'Send request';
  const noteDefault = note?.textContent ?? '';
  let copyTimer = 0;
  let busy = false;

  const say = (text: string) => {
    if (status) status.textContent = text;
  };

  const settle = (el: HTMLElement) => {
    // Settles in every time it appears, not only the first.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.animate([{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], {
        duration: 320,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      });
    }
  };

  const errorFor = (input: HTMLElement) => document.getElementById(input.getAttribute('aria-errormessage') ?? '');

  function setError(input: HTMLInputElement, message: string) {
    const el = errorFor(input);
    if (el) {
      el.textContent = message;
      el.hidden = false;
      input.setAttribute('aria-describedby', el.id);
    }
    input.setAttribute('aria-invalid', 'true');
  }

  function clearError(input: HTMLInputElement) {
    const el = errorFor(input);
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }

  function validate(): HTMLInputElement | null {
    let first: HTMLInputElement | null = null;
    const name = fields.name.value.trim();
    const address = fields.email.value.trim();
    clearError(fields.name);
    clearError(fields.email);
    if (!name) {
      setError(fields.name, messages.name.required!);
      first = fields.name;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(fields.email, messages.email.invalid!);
      first ??= fields.email;
    }
    return first;
  }

  function read(): ContactRequest {
    return {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      company: fields.company.value.trim(),
      needs: [...form.querySelectorAll<HTMLInputElement>('input[name^="need-"]:checked')].map((c) => c.value),
      when: fields.when.value,
      message: fields.message.value.trim(),
    };
  }

  // Hands the request to the visitor's email app. `reason` explains why, when sending failed.
  function offer(request: ContactRequest, reason?: string) {
    const subject = subjectFor(request);
    const body = formatRequest(request);
    const mailto = (text: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    // Long mailto links are cut short by some email apps, so only the link is shortened,
    // on whole characters; the preview and the clipboard always carry the full message.
    let linkBody = body;
    let href = mailto(linkBody);
    while (href.length > 1900 && linkBody.length > 200) {
      linkBody = [...linkBody].slice(0, -100).join('');
      href = mailto(linkBody);
    }
    const shortened = linkBody !== body;
    mailLink.href = href;
    preview.textContent = `To: ${email}\r\nSubject: ${subject}\r\n\r\n${body}`;
    if (note) note.textContent = reason ? `${reason} Send it from your email app instead, or copy it into any message.` : noteDefault;
    composed.hidden = false;
    settle(composed);
    say(
      (reason ? `${reason} ` : '') +
        (shortened
          ? 'Your request is ready. The message is long, so copy it rather than opening your email app.'
          : 'Your request is ready. Send it from your email app, or copy it.'),
    );
    mailLink.focus();
  }

  function showSent(request: ContactRequest) {
    if (!sent) return offer(request);
    if (sentEmail) sentEmail.textContent = request.email;
    entry.hidden = true;
    composed.hidden = true;
    sent.hidden = false;
    settle(sent);
    say(`Your request is sent. We reply within 1 business day to ${request.email}.`);
    sent.focus();
  }

  async function send(request: ContactRequest) {
    busy = true;
    submit.setAttribute('aria-disabled', 'true');
    submit.textContent = 'Sending';
    say('Sending your request.');
    try {
      const response = await fetch(contactBackend.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...request,
          website: honeypot?.value ?? '',
          elapsed: Math.round(performance.now() - opened),
          page: location.pathname,
        }),
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 202) return showSent(request);
      if (response.status === 400) {
        // The Worker names the fields it refused; the wording is the form's own.
        const data = (await response.json().catch(() => null)) as { fields?: Record<string, string> } | null;
        let first: HTMLInputElement | null = null;
        for (const key of ['name', 'email'] as const) {
          const code = data?.fields?.[key];
          if (code) {
            setError(fields[key], messages[key][code] ?? messages[key].invalid!);
            first ??= fields[key];
          }
        }
        if (first) {
          say('Check the highlighted fields.');
          first.focus();
          return;
        }
      }
      offer(request, response.status === 429 ? BUSY : FAILED);
    } catch {
      offer(request, FAILED);
    } finally {
      busy = false;
      submit.removeAttribute('aria-disabled');
      submit.textContent = submitLabel;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = validate();
    if (invalid) {
      say('Check the highlighted fields.');
      invalid.focus();
      return;
    }
    const request = read();
    if (contactBackend.live) void send(request);
    else offer(request);
  });

  // Edits after composing make the prepared message stale; hide it until the next submit.
  form.addEventListener('input', (event) => {
    const el = event.target;
    if (el === fields.name || el === fields.email) clearError(el as HTMLInputElement);
    if (!composed.hidden) composed.hidden = true;
  });

  sent?.querySelector<HTMLButtonElement>('[data-again]')?.addEventListener('click', () => {
    form.reset();
    clearError(fields.name);
    clearError(fields.email);
    sent.hidden = true;
    entry.hidden = false;
    say('');
    fields.name.focus();
  });

  copyButton.addEventListener('click', async () => {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(preview.textContent ?? '');
      copyButton.textContent = 'Copied';
      say('Message copied.');
    } catch {
      // No clipboard access: select the message below so a manual copy is one keystroke away.
      const range = document.createRange();
      range.selectNodeContents(preview);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      copyButton.textContent = 'Copy the selected text below';
      say('The message below is selected. Copy it with your keyboard.');
    }
    copyTimer = window.setTimeout(() => {
      copyButton.textContent = copyLabel;
    }, 2200);
  });

  // The domain check tells the page which domain it just looked at; offer it as the company website.
  document.addEventListener('domaincheck', (event) => {
    const domain = (event as CustomEvent<{ domain: string }>).detail?.domain;
    if (domain && !fields.company.value) fields.company.value = domain;
  });
}

document.querySelectorAll<HTMLFormElement>('[data-contact-form]').forEach(init);
