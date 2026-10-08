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

  const errorFor = (input: HTMLElement) => document.getElementById(input.getAttribute('aria-errormessage') ?? '');

  function setError(input: HTMLInputElement, message: string) {
    const el = errorFor(input);
    if (el) {
      el.textContent = message;
      el.hidden = false;
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
    let body = lines.join('\r\n');
    let href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // Long mailto links are cut short by some email apps; keep the message within reach.
    while (href.length > 1900 && body.length > 200) {
      body = body.slice(0, body.length - 100);
      href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    return { subject, body, href };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      invalid.focus();
      return;
    }
    const { subject, body, href } = compose();
    mailLink.href = href;
    preview.textContent = `To: ${email}\r\nSubject: ${subject}\r\n\r\n${body}`;
    composed.hidden = false;
    mailLink.focus();
  });

  for (const input of [fields.name, fields.email]) {
    input.addEventListener('input', () => clearError(input));
  }

  copyButton.addEventListener('click', async () => {
    const label = copyButton.textContent;
    try {
      await navigator.clipboard.writeText(preview.textContent ?? '');
      copyButton.textContent = 'Copied';
    } catch {
      copyButton.textContent = 'Select the text above and copy it';
    }
    setTimeout(() => {
      copyButton.textContent = label;
    }, 2200);
  });

  // The domain check tells the page which domain it just looked at; offer it as the company website.
  document.addEventListener('domaincheck', (event) => {
    const domain = (event as CustomEvent<{ domain: string }>).detail?.domain;
    if (domain && !fields.company.value) fields.company.value = domain;
  });
}

document.querySelectorAll<HTMLFormElement>('[data-contact-form]').forEach(init);
