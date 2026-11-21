// Prueba opcional de los iframes reales de Google, sin tocar el Sheet.
const { chromium } = await import(
  process.env.TOC_PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TOC_BROWSER_EXECUTABLE
    ? { executablePath: process.env.TOC_BROWSER_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 1300, height: 1000 },
    permissions: ["geolocation"],
    geolocation: { latitude: 7.0653, longitude: -73.8547, accuracy: 20 },
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/index.html?demo=1");
  await page.locator("#request-launch").click();
  await page
    .locator("#detected-address")
    .filter({ hasText: "Calle 49" })
    .waitFor();
  const map = page.locator("#client-map iframe");
  await map.waitFor();
  let frame = await (await map.elementHandle()).contentFrame();
  await frame.waitForLoadState("domcontentloaded", { timeout: 25000 });
  await frame
    .getByText("Términos", { exact: false })
    .first()
    .waitFor({ timeout: 25000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: "test-results/google-maps-live.png",
    fullPage: true,
  });
  console.log("Mapa Google real cargado:", frame.url());
  await page.getByRole("button", { name: "Ver lugar", exact: true }).click();
  frame = await (await map.elementHandle()).contentFrame();
  await frame.waitForLoadState("domcontentloaded", { timeout: 25000 });
  await frame
    .getByText("Girar la vista", { exact: false })
    .waitFor({ timeout: 25000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: "test-results/google-street-live.png",
    fullPage: true,
  });
  console.log("Street View real cargado dentro del cliente.");
} finally {
  await browser.close();
}
