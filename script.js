const root=document.documentElement;
const theme=document.getElementById("theme");
const saved=localStorage.getItem("sivr-theme");
if(saved) root.dataset.theme=saved;
theme.addEventListener("click",()=>{const next=root.dataset.theme==="light"?"dark":"light";root.dataset.theme=next;localStorage.setItem("sivr-theme",next);theme.textContent=next==="light"?"☼":"◐"});
document.getElementById("year").textContent=new Date().getFullYear();

const copy=document.getElementById("copy");
copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(document.getElementById("readmeText").innerText.trim());copy.textContent="Copied";setTimeout(()=>copy.textContent="Copy",1400)}catch{copy.textContent="Copy failed";setTimeout(()=>copy.textContent="Copy",1400)}});

const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("visible");observer.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll(".reveal").forEach(e=>observer.observe(e));
