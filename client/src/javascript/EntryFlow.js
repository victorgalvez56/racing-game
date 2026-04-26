import gsap from 'gsap'

const MODE_DATA = {
    race: {
        num:        '01',
        name:       'RACE',
        icon:       '🏁',
        accent:     'var(--rl-cyan)',
        objective:  'Set the fastest <em>5-lap</em> time. Sectors and curbs grade your line.',
        controls:   '<kbd>WASD</kbd> drive · <kbd>SHIFT</kbd> boost · <kbd>X</kbd> brake · <kbd>SPACE</kbd> jump · <kbd>R</kbd> respawn',
        tips:       'Hit boost pads. Watch sector splits. Curbs are flat — clip them. Off-track for 3s invalidates the lap.',
    },
    combat: {
        num:        '02',
        name:       'COMBAT',
        icon:       '💥',
        accent:     'var(--rl-redline)',
        objective:  'First driver to <em>5 kills</em> wins. Stay alive, hunt rivals.',
        controls:   '<kbd>WASD</kbd> drive · <kbd>SHIFT</kbd> boost · <kbd>X</kbd> brake · <kbd>SPACE</kbd> jump · <kbd>F</kbd> fire · <kbd>R</kbd> respawn',
        tips:       'Grab orange ammo crates and green health spheres. Missiles home toward enemies — don\'t waste them on walls.',
    },
}

export default class EntryFlow
{
    constructor(_options)
    {
        this.config     = _options.config
        this.onComplete = _options.onComplete

        this.$title      = document.getElementById('redline-title')
        this.$menu       = document.getElementById('redline-menu')
        this.$onboarding = document.getElementById('redline-onboarding')
        this.$grain      = document.getElementById('redline-grain')

        this._currentMode = null
        this._screen      = 'title'

        this._showTitle()
    }

    // ── Screen 1: Title ─────────────────────────────────────────────────────

    _showTitle()
    {
        this._screen = 'title'
        this.$title.classList.add('is-active')
        this.$grain?.classList.remove('hidden')

        // Initial state for entrance animation
        const wordmark = this.$title.querySelector('.rl-wordmark')
        const slash    = this.$title.querySelector('.rl-slash')
        const tagline  = this.$title.querySelector('.rl-tagline')
        const prompt   = this.$title.querySelector('.rl-prompt')
        const version  = this.$title.querySelector('.rl-version')

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.fromTo(wordmark, { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9 })
          .fromTo(slash,    { scaleX: 0,   opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.6 }, '-=0.5')
          .fromTo(tagline,  { y: 12,       opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
          .fromTo(version,  { opacity: 0 }, { opacity: 1, duration: 0.4 }, '-=0.4')
          .fromTo(prompt,   { opacity: 0 }, { opacity: 0.4, duration: 0.4 }, '-=0.1')

        // Listen for any key to advance
        this._titleHandler = (e) =>
        {
            // Ignore modifier-only key presses
            if(e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return
            this._goMenu()
        }
        document.addEventListener('keydown', this._titleHandler, { once: true })

        // Click also works
        this._titleClickHandler = () => this._goMenu()
        this.$title.addEventListener('click', this._titleClickHandler, { once: true })
    }

    _goMenu()
    {
        if(this._screen !== 'title') return
        document.removeEventListener('keydown', this._titleHandler)
        this.$title.removeEventListener('click', this._titleClickHandler)

        const wordmark = this.$title.querySelector('.rl-wordmark')
        const tagline  = this.$title.querySelector('.rl-tagline')

        gsap.timeline({
            onComplete: () =>
            {
                this.$title.classList.remove('is-active')
                this._showMenu()
            },
        })
        .to([wordmark, tagline, '.rl-slash', '.rl-prompt'], {
            opacity: 0, y: -8, duration: 0.35, ease: 'power2.in', stagger: 0.04,
        })
    }

    // ── Screen 2: Main Menu ─────────────────────────────────────────────────

    _showMenu()
    {
        this._screen = 'menu'
        this.$menu.classList.add('is-active')

        if(!this._menuBound)
        {
            this._menuBound = true
            this.$menu.querySelectorAll('.rl-card').forEach((card) =>
            {
                card.addEventListener('click', () => this._pickMode(card.dataset.mode))
            })
        }

        const header = this.$menu.querySelector('.rl-menu-header')
        const hero   = this.$menu.querySelector('.rl-hero')
        const cards  = this.$menu.querySelectorAll('.rl-card')
        const footer = this.$menu.querySelector('.rl-menu-footer')

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.fromTo(header, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 })
          .fromTo(hero,   { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, '-=0.2')
          .fromTo(cards,  { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.08 }, '-=0.25')
          .fromTo(footer, { opacity: 0 },        { opacity: 1, duration: 0.4 }, '-=0.2')
    }

    _hideMenu(onDone)
    {
        const cards  = this.$menu.querySelectorAll('.rl-card')
        const hero   = this.$menu.querySelector('.rl-hero')
        const footer = this.$menu.querySelector('.rl-menu-footer')

        gsap.timeline({
            onComplete: () =>
            {
                this.$menu.classList.remove('is-active')
                onDone?.()
            },
        })
        .to(cards,  { y: -16, opacity: 0, duration: 0.3, ease: 'power2.in', stagger: 0.04 })
        .to([hero, footer], { opacity: 0, duration: 0.25, ease: 'power2.in' }, '-=0.25')
    }

    // ── Screen 3: Onboarding ────────────────────────────────────────────────

    _pickMode(mode)
    {
        if(this._screen !== 'menu') return
        this._currentMode = mode
        this._showOnboarding(mode)
    }

    _showOnboarding(mode)
    {
        this._screen = 'onboarding'

        const data = MODE_DATA[mode]
        this.$onboarding.style.setProperty('--ob-accent', data.accent)
        this.$onboarding.querySelector('.rl-ob-icon').textContent  = data.icon
        this.$onboarding.querySelector('.rl-ob-mode').textContent  = `MODE ${data.num}`
        this.$onboarding.querySelector('.rl-ob-title').textContent = data.name
        this.$onboarding.querySelector('#ob-objective').innerHTML  = data.objective
        this.$onboarding.querySelector('#ob-controls').innerHTML   = data.controls
        this.$onboarding.querySelector('#ob-tips').innerHTML       = data.tips

        if(!this._obBound)
        {
            this._obBound = true
            this.$onboarding.querySelector('.rl-ob-btn-solo').addEventListener('click',
                () => this._enterGame(true))
            this.$onboarding.querySelector('.rl-ob-btn-online').addEventListener('click',
                () => this._enterGame(false))
            this.$onboarding.querySelector('.rl-ob-back').addEventListener('click',
                () => this._closeOnboarding())
            this._obKeyHandler = (e) =>
            {
                if(this._screen !== 'onboarding') return
                if(e.key === 'Escape') this._closeOnboarding()
            }
            document.addEventListener('keydown', this._obKeyHandler)
        }

        this.$onboarding.classList.add('is-active')

        const card = this.$onboarding.querySelector('.rl-ob-card')
        gsap.fromTo(this.$onboarding,
            { opacity: 0 },
            { opacity: 1, duration: 0.25, ease: 'power2.out' })
        gsap.fromTo(card,
            { y: 16, scale: 0.96, opacity: 0 },
            { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' })

        // Mark this mode's onboarding as seen
        try { localStorage.setItem(`redline.onboardingSeen.${mode}`, '1') } catch {}
    }

    _closeOnboarding()
    {
        if(this._screen !== 'onboarding') return
        this._screen = 'menu'

        const card = this.$onboarding.querySelector('.rl-ob-card')
        gsap.timeline({
            onComplete: () => this.$onboarding.classList.remove('is-active'),
        })
        .to(card, { y: 8, scale: 0.98, opacity: 0, duration: 0.22, ease: 'power2.in' })
        .to(this.$onboarding, { opacity: 0, duration: 0.2, ease: 'power2.in' }, '-=0.15')
    }

    // ── Final transition into the game ──────────────────────────────────────

    _enterGame(soloMode)
    {
        // Set game config
        this.config.gameMode = this._currentMode
        this.config.soloMode = !!soloMode

        // Animate everything out
        const card = this.$onboarding.querySelector('.rl-ob-card')
        const tl = gsap.timeline({
            onComplete: () =>
            {
                this.$onboarding.classList.remove('is-active')
                this.$menu.classList.remove('is-active')
                this.$grain?.classList.add('hidden')
                this.onComplete?.()
            },
        })
        tl.to(card, { y: -8, scale: 0.96, opacity: 0, duration: 0.3, ease: 'power2.in' })
          .to([this.$onboarding, this.$menu], { opacity: 0, duration: 0.3, ease: 'power2.in' }, '-=0.2')
    }
}
