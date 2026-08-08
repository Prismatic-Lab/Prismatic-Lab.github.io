const root = document.documentElement;
const theme = document.getElementById("theme");


// --------------------------------
// THEME
// --------------------------------

const savedTheme = localStorage.getItem("sivr-theme");

if (savedTheme) {
  root.dataset.theme = savedTheme;

  theme.textContent =
    savedTheme === "light"
      ? "☼"
      : "◐";
}


theme.addEventListener("click", () => {

  const next =
    root.dataset.theme === "light"
      ? "dark"
      : "light";

  root.dataset.theme = next;

  localStorage.setItem(
    "sivr-theme",
    next
  );

  theme.textContent =
    next === "light"
      ? "☼"
      : "◐";

});


// --------------------------------
// YEAR
// --------------------------------

document.getElementById("year").textContent =
  new Date().getFullYear();


// --------------------------------
// README COPY
// --------------------------------

const copy = document.getElementById("copy");

copy.addEventListener("click", async () => {

  try {

    const text =
      document
        .getElementById("readmeText")
        .innerText
        .trim();

    await navigator.clipboard.writeText(text);

    copy.textContent = "Copied";

    setTimeout(() => {
      copy.textContent = "Copy";
    }, 1400);

  } catch (error) {

    copy.textContent = "Copy failed";

    setTimeout(() => {
      copy.textContent = "Copy";
    }, 1400);

  }

});


// --------------------------------
// SCROLL REVEAL
// --------------------------------

const observer =
  new IntersectionObserver(
    entries => {

      entries.forEach(entry => {

        if (entry.isIntersecting) {

          entry.target.classList.add(
            "visible"
          );

          observer.unobserve(
            entry.target
          );

        }

      });

    },
    {
      threshold:0.12
    }
  );


document
  .querySelectorAll(".reveal")
  .forEach(element => {

    observer.observe(element);

  });
