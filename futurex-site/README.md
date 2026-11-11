# FutureX website

The company website of FutureX Technical Solutions LLC (CR 1685674), in English and Arabic. One page: telecom infrastructure, data centres, artificial intelligence and applications, the company's own products (Hisab, ATND), how a project runs, the company and contact details.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install the tools (once) |
| `npm run dev` | Run the site locally while editing |
| `npm run build` | Build the real site into `dist/` (for Cloudflare Pages) |
| `npm run build:preview` | Build the private preview into `dist-preview/` (fonts and images inlined) |

All words, in both languages, are in `src/i18n/content.js`. Keep English and Arabic in step, and keep claims factual: services offered, no invented clients, projects or numbers.

## Tools and licences

| Tool | Used for | Licence |
| --- | --- | --- |
| GSAP (ScrollTrigger, SplitText) | Text and scroll animation | GSAP standard licence: free, including commercial use |
| Lenis | Smooth scrolling | MIT |
| React Bits: Threads, SpotlightCard (`src/components/`) | Hero background, product cards | MIT + Commons Clause (`src/components/REACT-BITS-LICENSE.md`): free inside a site; the components may not be resold on their own |
| Montserrat, IBM Plex Sans / Sans Arabic / Mono | Type, bundled with the site | SIL Open Font License |

Every animation turns off for visitors whose device asks for reduced motion. There are no analytics, cookies, forms or third-party requests: the site only shows contact details.

## Hosting (Cloudflare Pages, free plan, commercial use allowed)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → this repository.
2. Root directory `futurex-site`, build command `npm run build`, output directory `dist`.
3. While testing, protect it with Cloudflare Access (free) so only the team can open it.

`public/_headers` sets the security headers (content security policy, no framing, HTTPS only).

## Before going live

- Remove the `robots` meta tag in `index.html`, the `X-Robots-Tag` line in `public/_headers`, and allow crawling in `public/robots.txt`. They keep the test site out of search engines.
- Add the business activities (telecom, data centres, software, AI) to the Commercial Registration; it currently lists no licensed activities.
- Connect the company domain in Cloudflare Pages.
- Run the `legal-launch-checklist` and `security-launch-checklist` skills.
