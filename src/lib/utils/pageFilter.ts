type PageFilterOptions = {
  input: HTMLInputElement;
  empty: HTMLElement;
};

/** Filters `a[data-search]` links and their `[data-page-section]` groups. */
export function setupPageFilter({ input, empty }: PageFilterOptions) {
  const sections = [
    ...document.querySelectorAll<HTMLElement>("[data-page-section]"),
  ];
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>("a[data-search]"),
  ];

  const filter = () => {
    const query = input.value.trim().toLowerCase();
    for (const link of links) {
      link.parentElement!.hidden = !link.dataset.search!.includes(query);
    }
    for (const section of sections) {
      section.hidden = ![
        ...section.querySelectorAll<HTMLAnchorElement>("a[data-search]"),
      ].some((link) => !link.parentElement!.hidden);
    }
    empty.hidden = links.some((link) => !link.parentElement!.hidden);
  };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      links.find((link) => !link.parentElement!.hidden)?.click();
    } else if (e.key === "Escape") {
      input.value = "";
      filter();
    }
  });
  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (
      e.key === "/" &&
      target !== input &&
      !target.closest("input, textarea, [contenteditable]")
    ) {
      e.preventDefault();
      input.focus();
    }
  });
}
