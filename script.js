        // DOM Elements
        const scrollProgress = document.getElementById('scrollProgress');
        const desktopNavMenu = document.getElementById('desktopNavMenu');
        const mobileNavMenu = document.getElementById('mobileNavMenu');
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const mobileDrawer = document.getElementById('mobileDrawer');
        const drawerOverlay = document.getElementById('drawerOverlay');

        // Clone Desktop Menu to Mobile Drawer
        mobileNavMenu.innerHTML = desktopNavMenu.innerHTML;

        // Drawer Controls
        function openDrawer() {
            mobileDrawer.classList.add('active');
            drawerOverlay.classList.add('active');
        }

        function closeDrawer() {
            mobileDrawer.classList.remove('active');
            drawerOverlay.classList.remove('active');
        }

        hamburgerBtn.addEventListener('click', openDrawer);
        drawerOverlay.addEventListener('click', closeDrawer);

        // Mobile Nav Item Clicks
        mobileNavMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                closeDrawer();
            });
        });

        // Scroll Progress & Active Nav Indicator
        window.addEventListener('scroll', () => {
            // Progress Bar
            const winScroll = document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (winScroll / height) * 100;
            scrollProgress.style.width = scrolled + '%';

            // Active Section Highlight
            const sections = document.querySelectorAll('section');
            let currentSec = '';

            sections.forEach(section => {
                const sectionTop = section.offsetTop - 100;
                if (window.scrollY >= sectionTop) {
                    currentSec = section.getAttribute('id');
                }
            });

            document.querySelectorAll('.nav-item').forEach(li => {
                li.classList.remove('active');
                const href = li.querySelector('a').getAttribute('href');
                if (href === '#' + currentSec) {
                    li.classList.add('active');
                }
            });

            // Reveal Animations
            document.querySelectorAll('.reveal').forEach(el => {
                const elementTop = el.getBoundingClientRect().top;
                if (elementTop < window.innerHeight - 80) {
                    el.classList.add('active');
                }
            });
        });

        // Initial Trigger for Reveal
        window.dispatchEvent(new Event('scroll'));
