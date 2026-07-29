"use client";

import { useEffect } from 'react';

const sectionIds = [
  'overview',
  'quickstart',
  'concepts',
  'api-reference',
  'client-sdk',
  'web-push',
  'security',
  'errors',
] as const;

export function DocsSectionController() {
  useEffect(() => {
    const syncSection = () => {
      const requestedSection = window.location.hash.slice(1);
      const activeSection = sectionIds.includes(requestedSection as (typeof sectionIds)[number])
        ? requestedSection
        : 'overview';
      const flow = document.querySelector<HTMLElement>('.docs-section-flow');

      flow?.setAttribute('data-active-section', activeSection);

      document.querySelectorAll<HTMLElement>('[data-doc-section-link]').forEach((link) => {
        const isActive = link.dataset.docSectionLink === activeSection;
        link.dataset.active = isActive ? 'true' : 'false';
        if (isActive) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    };

    syncSection();
    window.addEventListener('hashchange', syncSection);
    return () => window.removeEventListener('hashchange', syncSection);
  }, []);

  return null;
}

