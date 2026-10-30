"use client";

import { useEffect } from 'react';

/**
 * Highlights the section currently in view. The guide is one continuous page,
 * so the nav tracks scroll position rather than the URL hash.
 */
export function GuideNav({ sectionIds }: { sectionIds: readonly string[] }) {
  useEffect(() => {
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) {
      return;
    }

    const markActive = (activeId: string) => {
      document.querySelectorAll<HTMLElement>('[data-doc-section-link]').forEach((link) => {
        const isActive = link.dataset.docSectionLink === activeId;
        link.dataset.active = isActive ? 'true' : 'false';
        if (isActive) {
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    };

    markActive(sectionIds[0]);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) {
          markActive(visible[0].target.id);
        }
      },
      // Bias the active band just below the sticky header.
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  return null;
}
