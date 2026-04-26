import EventEmitter from '../Utils/EventEmitter'

export default class Controls extends EventEmitter
{
    constructor(_options)
    {
        super()

        this.config = _options.config
        this.sizes = _options.sizes
        this.time = _options.time
        this.camera = _options.camera
        this.sounds = _options.sounds

        // Set by World after Network is ready
        this.network = null

        this.setActions()
        this.setKeyboard()

        // Auto-init touch UI on touch-capable devices. The Application's
        // global touchstart handler used to do this on first tap, but that
        // tap fires on the title screen *before* World/Controls exists, so
        // `world?.controls.setTouch()` no-ops and the listener (`once: true`)
        // is consumed — leaving touch users with no on-screen controls.
        const touchCapable =
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0)

        if(touchCapable)
        {
            // Defer one frame so the DOM is settled and World has registered
            // its tick listeners (the joystick reads from this.time on tick).
            requestAnimationFrame(() => this.setTouch())
        }
    }

    setActions()
    {
        this.actions = {}
        this.actions.up = false
        this.actions.right = false
        this.actions.down = false
        this.actions.left = false
        this.actions.brake = false
        this.actions.boost = false

        document.addEventListener('visibilitychange', () =>
        {
            if(!document.hidden)
            {
                this.actions.up = false
                this.actions.right = false
                this.actions.down = false
                this.actions.left = false
                this.actions.brake = false
                this.actions.boost = false
                this._sendInput()
            }
        })
    }

    _sendInput()
    {
        if(this.network)
        {
            this.network.sendInput({ ...this.actions })
        }
    }

    setKeyboard()
    {
        this.keyboard = {}
        this.keyboard.events = {}

        this.keyboard.events.keyDown = (_event) =>
        {
            // Don't steal keys from text inputs (chat, lobby forms)
            const tag = document.activeElement?.tagName
            if(tag === 'INPUT' || tag === 'TEXTAREA') return

            switch(_event.code)
            {
                case 'ArrowUp':
                case 'KeyW':
                    this.camera.pan.reset()
                    this.actions.up = true
                    this._sendInput()
                    break

                case 'ArrowRight':
                case 'KeyD':
                    this.actions.right = true
                    this._sendInput()
                    break

                case 'ArrowDown':
                case 'KeyS':
                    this.camera.pan.reset()
                    this.actions.down = true
                    this._sendInput()
                    break

                case 'ArrowLeft':
                case 'KeyA':
                    this.actions.left = true
                    this._sendInput()
                    break

                case 'ControlLeft':
                case 'ControlRight':
                case 'KeyX':
                    this.actions.brake = true
                    this._sendInput()
                    break

                case 'Space':
                    // Tap action — handled by World, not held.
                    // preventDefault stops the browser from scrolling on space.
                    _event.preventDefault()
                    this.trigger('action', ['jump'])
                    break

                case 'ShiftLeft':
                case 'ShiftRight':
                    this.actions.boost = true
                    this._sendInput()
                    break

                case 'KeyF':
                    this.trigger('action', ['fire'])
                    break
            }
        }

        this.keyboard.events.keyUp = (_event) =>
        {
            switch(_event.code)
            {
                case 'ArrowUp':
                case 'KeyW':
                    this.actions.up = false
                    this._sendInput()
                    break

                case 'ArrowRight':
                case 'KeyD':
                    this.actions.right = false
                    this._sendInput()
                    break

                case 'ArrowDown':
                case 'KeyS':
                    this.actions.down = false
                    this._sendInput()
                    break

                case 'ArrowLeft':
                case 'KeyA':
                    this.actions.left = false
                    this._sendInput()
                    break

                case 'ControlLeft':
                case 'ControlRight':
                case 'KeyX':
                    this.actions.brake = false
                    this._sendInput()
                    break

                case 'ShiftLeft':
                case 'ShiftRight':
                    this.actions.boost = false
                    this._sendInput()
                    break

                case 'KeyR':
                    this.trigger('action', ['reset'])
                    break
            }
        }

        document.addEventListener('keydown', this.keyboard.events.keyDown)
        document.addEventListener('keyup', this.keyboard.events.keyUp)
    }

    setTouch()
    {
        if(this.touch?.$root) return        // idempotent — only build once

        this.touch = {}

        this.touch.$root = document.createElement('div')
        this.touch.$root.id = 'rl-touch-controls'
        document.body.appendChild(this.touch.$root)

        this._buildTouchJoystick()
        this._buildTouchButtons()

        // Fade in once the countdown completes (called from World.setReveal)
        this.touch.reveal = () =>
        {
            this.touch.$root.classList.add('visible')
        }

        // Combat mode unhides the Fire button (called from World.setCombat)
        this.touch.showFire = () =>
        {
            if(this.touch.fire) this.touch.fire.style.display = ''
        }
    }

    // ── 2-axis joystick → actions.up/down/left/right ──────────────────────
    _buildTouchJoystick()
    {
        const joy = this.touch.joystick = {
            active:  false,
            touchId: null,
            current: { x: 0, y: 0 },
            center:  { x: 0, y: 0 },
        }

        const $j = document.createElement('div')
        $j.className = 'rl-touch-joystick'
        $j.innerHTML = `
            <div class="rl-touch-joystick-ring"></div>
            <div class="rl-touch-joystick-cursor"></div>
        `
        this.touch.$root.appendChild($j)
        joy.$element = $j
        joy.$cursor  = $j.querySelector('.rl-touch-joystick-cursor')

        // Track joystick center (recompute after layout + on resize)
        const updateCenter = () =>
        {
            const r = $j.getBoundingClientRect()
            joy.center.x = r.left + r.width / 2
            joy.center.y = r.top  + r.height / 2
        }
        this.sizes.on('resize', updateCenter)
        requestAnimationFrame(updateCenter)

        // Convert deflection → 4-way booleans on each tick
        this.time.on('tick', () =>
        {
            if(!joy.active) return

            const dx = joy.current.x - joy.center.x
            const dy = joy.current.y - joy.center.y
            const DZ = 12   // deadzone in px

            const left  = dx < -DZ
            const right = dx >  DZ
            const up    = dy < -DZ      // touch above center = forward
            const down  = dy >  DZ

            const changed =
                left  !== this.actions.left  ||
                right !== this.actions.right ||
                up    !== this.actions.up    ||
                down  !== this.actions.down

            this.actions.left  = left
            this.actions.right = right
            this.actions.up    = up
            this.actions.down  = down

            if(changed) this._sendInput()

            // Cursor follows touch, capped to 50px radius
            const dist = Math.min(Math.hypot(dx, dy), 50)
            const ang  = Math.atan2(dy, dx)
            joy.$cursor.style.transform =
                `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`
        })

        // Capture touch on the joystick itself…
        $j.addEventListener('touchstart', (e) =>
        {
            e.preventDefault()
            const t = e.changedTouches[0]
            if(!t) return
            joy.active    = true
            joy.touchId   = t.identifier
            joy.current.x = t.clientX
            joy.current.y = t.clientY
            this.camera?.pan?.reset?.()
        }, { passive: false })

        // …but track move + release on document so the finger can wander
        document.addEventListener('touchmove', (e) =>
        {
            if(!joy.active) return
            const t = [...e.changedTouches].find(tc => tc.identifier === joy.touchId)
            if(!t) return
            e.preventDefault()
            joy.current.x = t.clientX
            joy.current.y = t.clientY
        }, { passive: false })

        const releaseJoy = (e) =>
        {
            if(!joy.active) return
            const t = [...e.changedTouches].find(tc => tc.identifier === joy.touchId)
            if(!t) return
            joy.active  = false
            joy.touchId = null
            joy.$cursor.style.transform = 'translate(0,0)'

            if(this.actions.up || this.actions.down || this.actions.left || this.actions.right)
            {
                this.actions.up    = false
                this.actions.down  = false
                this.actions.left  = false
                this.actions.right = false
                this._sendInput()
            }
        }
        document.addEventListener('touchend',    releaseJoy)
        document.addEventListener('touchcancel', releaseJoy)
    }

    // ── Right-thumb action buttons (brake / boost / jump / fire) ─────────
    _buildTouchButtons()
    {
        const makeHold = (id, label, icon, slot, onPress, onRelease, accent) =>
        {
            const $b = document.createElement('button')
            $b.className = 'rl-touch-btn'
            $b.id = `rl-touch-${id}`
            $b.dataset.slot = String(slot)
            if(accent) $b.dataset.accent = accent
            $b.innerHTML =
                `<span class="rl-touch-btn-icon">${icon}</span>` +
                `<span class="rl-touch-btn-label">${label}</span>`
            this.touch.$root.appendChild($b)

            $b.addEventListener('touchstart', (e) =>
            {
                e.preventDefault()
                $b.classList.add('active')
                onPress()
            }, { passive: false })

            const release = () => { $b.classList.remove('active'); onRelease() }
            $b.addEventListener('touchend',    release)
            $b.addEventListener('touchcancel', release)
            return $b
        }

        const makeTap = (id, label, icon, slot, onTap, accent, hidden = false) =>
        {
            const $b = document.createElement('button')
            $b.className = 'rl-touch-btn rl-touch-btn-tap'
            $b.id = `rl-touch-${id}`
            $b.dataset.slot = String(slot)
            if(accent) $b.dataset.accent = accent
            if(hidden) $b.style.display = 'none'
            $b.innerHTML =
                `<span class="rl-touch-btn-icon">${icon}</span>` +
                `<span class="rl-touch-btn-label">${label}</span>`
            this.touch.$root.appendChild($b)

            $b.addEventListener('touchstart', (e) =>
            {
                e.preventDefault()
                $b.classList.add('active')
                window.setTimeout(() => $b.classList.remove('active'), 120)
                onTap()
            }, { passive: false })
            return $b
        }

        // Slot 0 = bottom (most reachable). Stack rises upward.
        // Using emoji glyphs because unicode symbols (⊘ ⚡ ⇧) fall back to
        // generic triangles on some Android system fonts.
        this.touch.brake = makeHold('brake', 'BRAKE', '🛑', 0,
            () => { this.actions.brake = true;  this._sendInput() },
            () => { this.actions.brake = false; this._sendInput() })

        this.touch.boost = makeHold('boost', 'BOOST', '🔥', 1,
            () => { this.actions.boost = true;  this._sendInput() },
            () => { this.actions.boost = false; this._sendInput() },
            'amber')

        this.touch.jump = makeTap('jump', 'JUMP', '⬆️', 2,
            () => this.trigger('action', ['jump']),
            'cyan')

        // Fire — combat-mode-only. World.setCombat calls touch.showFire().
        this.touch.fire = makeTap('fire', 'FIRE', '🚀', 3,
            () => this.trigger('action', ['fire']),
            'redline',
            true)
    }
}
