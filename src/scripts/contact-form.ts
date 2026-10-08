// The scoping request form. This site has no server, so the form composes the request
// and hands it to the visitor's own email app (a mailto: link) or to the clipboard.
// Nothing is sent to, or stored on, this site.

function init(form: HTMLFormElement) {
  const email = form.dataset.to ?? '';
  const fields = {
    name: form.querySelector<HTMLInputElement>('[name="name"]')!,
    email: form.querySelector<HTMLInputElement>('[name="email"]')!,
    company: form.querySelector<HTMLInputElement>('[name="company"]')!,
    when: form.querySelector<HTMLSelectElement>('[name="when"]')!,
    message: form.querySelector<HTMLTextAreaElement>('[name="message"]')!,
  };
  const composed = form.querySelector<HTMLElement>('[data-composed]')!;
  const mailLink = form.querySelector<HTMLAnchorElement>('[data-mailto]')!;
  const copyButton = form.querySelector<HTMLButtonElement>('[data-copy]')!;
  const preview = form.querySelector<HTMLElement>('[data-preview]')!;
  const status = form.querySelector<HTMLElement>('[data-status]');
  const copyLabel = copyButton.textContent ?? 'Copy the message';
  let copyTimer = 0;

  const say = (text: string) => {
    if (status) status.textContent = text;
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
      setError(fields.name, 'Enter your name, so we know who to reply to.');
      first = fields.name;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(fields.email, 'Enter a work email address, for example you@company.ae.');
      first ??= fields.email;
    }
    return first;
  }

  function compose() {
    const needs = [...form.querySelectorAll<HTMLInputElement>('input[name^="need-"]:checked')].map((c) => c.value);
    const company = fields.company.value.trim();
    const subject = `Scoping call request${company ? `: ${company}` : ''}`;
    const lines = [
      `Name: ${fields.name.value.trim()}`,
      `Email: ${fields.email.value.trim()}`,
      `Company: ${company || 'not given'}`,
      `Needs: ${needs.length ? needs.join(', ') : 'not sure yet'}`,
      `Timeline: ${fields.when.value}`,
    ];
    const message = fields.message.value.trim();
    if (message) lines.push('', message);
    lines.push('', 'Sent from the scoping request form on securitysolution.tech');
    const body = lines.join('\r\n');
    const mailto = (text: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    // Long mailto links are cut short by some email apps, so only the link is shortened,
    // on whole characters; the preview and the clipboard always carry the full message.
    let linkBody = body;
    let href = mailto(linkBody);
    while (href.length > 1900 && linkBody.length > 200) {
      linkBody = [...linkBody].slice(0, -100).join('');
      href = mailto(linkBody);
    }
    return { subject, body, href, shortened: linkBody !== body };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      say('Check the highlighted fields.');
      invalid.focus();
      return;
    }
    const { subject, body, href, shortened } = compose();
    mailLink.href = href;
    preview.textContent = `To: ${email}\r\nSubject: ${subject}\r\n\r\n${body}`;
    composed.hidden = false;
    say(
      shortened
        ? 'Your request is ready. The message is long, so copy it rather than opening your email app.'
        : 'Your request is ready. Send it from your email app, or copy it.',
    );
    mailLink.focus();
  });

  // Edits after composing make the prepared message stale; hide it until the next submit.
  form.addEventListener('input', (event) => {
    const el = event.target;
    if (el === fields.name || el === fields.email) clearError(el as HTMLInputElement);
    if (!composed.hidden) composed.hidden = true;
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
