// Learning Journal PWA - Main JavaScript File

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================
    // Connectivity indicator (offline/online banner)
    // ==========================================
    initConnectionBanner();

    // ==========================================
    // Mobile Navigation Toggle
    // ==========================================
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            navLinks.classList.toggle('active');
            
            // Prevent body scroll when menu is open
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
        });
        
        // Close menu when clicking on a link
        const navLinkItems = navLinks.querySelectorAll('a');
        navLinkItems.forEach(link => {
            link.addEventListener('click', function() {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
    
    // ==========================================
    // Navbar Scroll Effect
    // ==========================================
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;
    
    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;
        
        // Add scrolled class when page is scrolled
        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });
    
    // ==========================================
    // Smooth Scrolling for Anchor Links
    // ==========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only prevent default if it's not just "#"
            if (href !== '#' && href !== '') {
                e.preventDefault();
                
                const target = document.querySelector(href);
                if (target) {
                    const navHeight = navbar.offsetHeight;
                    const targetPosition = target.offsetTop - navHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // ==========================================
    // Scroll Animation for Fade-In Elements
    // ==========================================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    // Observe all fade-in elements
    document.querySelectorAll('.fade-in').forEach(element => {
        observer.observe(element);
    });
    
    // ==========================================
    // Active Navigation Link
    // ==========================================
    function setActiveNavLink() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navLinkItems = document.querySelectorAll('.nav-links a');
        
        navLinkItems.forEach(link => {
            link.classList.remove('active');
            const linkHref = link.getAttribute('href');
            
            if (linkHref === currentPage || 
                (currentPage === '' && linkHref === 'index.html') ||
                (currentPage === '/' && linkHref === 'index.html')) {
                link.classList.add('active');
            }
        });
    }
    
    setActiveNavLink();
    
    // ==========================================
    // Statistics Counter Animation
    // ==========================================
    function animateCounter(element, target, duration = 2000) {
        const start = 0;
        const increment = target / (duration / 16); // 60fps
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target;
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current);
            }
        }, 16);
    }
    
    // Animate stats when they come into view
    const statsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.animated) {
                const number = entry.target.querySelector('.stat-number');
                if (number) {
                    const targetValue = parseInt(number.textContent);
                    number.textContent = '0';
                    animateCounter(number, targetValue);
                    entry.target.dataset.animated = 'true';
                }
            }
        });
    }, { threshold: 0.5 });
    
    document.querySelectorAll('.stat-item').forEach(stat => {
        statsObserver.observe(stat);
    });
    
    // ==========================================
    // Project Card Interactions
    // ==========================================
    const projectCards = document.querySelectorAll('.project-card');
    
    projectCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
    
    // ==========================================
    // Form Validation (if you add forms later)
    // ==========================================
    function validateForm(form) {
        const inputs = form.querySelectorAll('input[required], textarea[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
            } else {
                input.classList.remove('error');
            }
        });
        
        return isValid;
    }
    
    // ==========================================
    // Skill Item Hover Effects
    // ==========================================
    const skillItems = document.querySelectorAll('.skill-item');
    
    skillItems.forEach(skill => {
        skill.addEventListener('click', function() {
            // Add a ripple effect or additional interaction
            this.style.transform = 'scale(1.05)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 200);
        });
    });
    
    // ==========================================
    // Feature Cards Staggered Animation
    // ==========================================
    const featureCards = document.querySelectorAll('.feature-card');
    
    const featureObserver = new IntersectionObserver(function(entries) {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 100); // Stagger by 100ms
            }
        });
    }, { threshold: 0.1 });
    
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s ease';
        featureObserver.observe(card);
    });
    
    // ==========================================
    // Journal Card Staggered Animation
    // ==========================================
    const journalCards = document.querySelectorAll('.journal-card');
    
    const journalObserver = new IntersectionObserver(function(entries) {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 150); // Stagger by 150ms
            }
        });
    }, { threshold: 0.1 });
    
    journalCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s ease';
        journalObserver.observe(card);
    });
    
    // ==========================================
    // Back to Top Button (Optional)
    // ==========================================
    function createBackToTopButton() {
        const button = document.createElement('button');
        button.innerHTML = '↑';
        button.className = 'back-to-top';
        button.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            z-index: 999;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        `;
        
        document.body.appendChild(button);
        
        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 300) {
                button.style.opacity = '1';
                button.style.visibility = 'visible';
            } else {
                button.style.opacity = '0';
                button.style.visibility = 'hidden';
            }
        });
        
        button.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
        
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.6)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.4)';
        });
    }
    
    // Initialize back to top button
    createBackToTopButton();

    // ==========================================
    // Connectivity Banner
    // ==========================================
    function initConnectionBanner() {
        const banner = document.createElement('div');
        banner.id = 'connectionBanner';
        banner.className = 'connection-banner';
        banner.innerHTML = `
            <span class="status-dot" aria-hidden="true"></span>
            <span class="status-text" role="status"></span>
        `;
        document.body.appendChild(banner);

        const updateState = (isOnline) => {
            banner.dataset.state = isOnline ? 'online' : 'offline';
            const text = banner.querySelector('.status-text');
            const dot = banner.querySelector('.status-dot');
            if (isOnline) {
                text.textContent = 'Back online. Changes will sync automatically.';
                dot.textContent = '✅';
                banner.classList.remove('hidden');
                setTimeout(() => banner.classList.add('hidden'), 3500);
            } else {
                text.textContent = 'You are offline. Viewing cached content.';
                dot.textContent = '⚡';
                banner.classList.remove('hidden');
            }
        };

        updateState(navigator.onLine);
        window.addEventListener('online', () => updateState(true));
        window.addEventListener('offline', () => updateState(false));
    }
    
    // ==========================================
    // Console Welcome Message
    // ==========================================
    console.log('%c Welcome to Learning Journal PWA! ', 
        'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 16px; padding: 10px 20px; border-radius: 5px;');
    console.log('%c Built with HTML, CSS, and JavaScript ', 
        'color: #667eea; font-size: 14px; padding: 5px;');
    console.log('%c Check out the code on GitHub! ', 
        'color: #764ba2; font-size: 14px; padding: 5px;');
    
    // ==========================================
    // Performance Monitoring (Optional)
    // ==========================================
    if (window.performance) {
        window.addEventListener('load', function() {
            setTimeout(() => {
                const perfData = window.performance.timing;
                const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                console.log(`Page Load Time: ${pageLoadTime}ms`);
            }, 0);
        });
    }
    
    // ==========================================
    // Dark Mode Toggle (Future Feature)
    // ==========================================
    function initDarkMode() {
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            const darkMode = localStorage.getItem('darkMode');
            
            if (darkMode === 'enabled') {
                document.body.classList.add('dark-mode');
            }
            
            darkModeToggle.addEventListener('click', function() {
                document.body.classList.toggle('dark-mode');
                
                if (document.body.classList.contains('dark-mode')) {
                    localStorage.setItem('darkMode', 'enabled');
                } else {
                    localStorage.setItem('darkMode', null);
                }
            });
        }
    }
    
    // Uncomment when dark mode styles are added
    // initDarkMode();
    
    // ==========================================
    // Service Worker Registration (Week 3+)
    // ==========================================
    // Register the service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js')
          .then(function(registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          }, function(err) {
            console.log('ServiceWorker registration failed: ', err);
          });
      });
    }

    // Handle the PWA install prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // Show the custom install UI or button (optionally, add a button to trigger prompt)
      const installBtn = document.createElement('button');
      installBtn.innerText = 'Install App';
      installBtn.style.position = 'fixed';
      installBtn.style.bottom = '20px';
      installBtn.style.right = '20px';
      installBtn.style.zIndex = '1000';
      installBtn.style.padding = '1em';
      installBtn.style.background = '#1976d2';
      installBtn.style.color = 'white';
      installBtn.style.border = 'none';
      installBtn.style.borderRadius = '10px';
      installBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      installBtn.onclick = async () => {
        installBtn.remove();
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        deferredPrompt = null;
      };
      document.body.appendChild(installBtn);
    });
    
    // Welcome Modal Show Once-Per-Session
    const modal = document.querySelector('.welcome-modal-backdrop');
    const closeBtn = modal?.querySelector('.welcome-modal-close');
    if (modal && !sessionStorage.getItem('WELCOMED_THIS_SESSION')) {
      modal.style.display = 'flex';
      setTimeout(() => { modal.style.opacity = '1'; }, 10);
      closeBtn?.addEventListener('click', function () {
        modal.style.opacity = '0';
        setTimeout(() => { modal.style.display = 'none'; }, 400);
        sessionStorage.setItem('WELCOMED_THIS_SESSION', 'yes');
      });
    }
    
});

// ==========================================
// Utility Functions
// ==========================================

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for performance
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}