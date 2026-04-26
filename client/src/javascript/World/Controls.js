import mobileTriangle       from '../../images/mobile/triangle.png'
import mobileDoubleTriangle from '../../images/mobile/doubleTriangle.png'
import mobileCross          from '../../images/mobile/cross.png'
import EventEmitter         from '../Utils/EventEmitter'

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

        // Refcount sets for actions that multiple sources can press
        // (joystick + forward/backward/boost buttons).
        this._upHeldBy   = new Set()
        this._downHeldBy = new Set()

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
            origin:  { x: 0, y: 0 },     // where the finger first landed
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

        // 2-axis steering: X = left/right, Y = forward/back.
        //
        // Deflection is measured from where the FINGER first landed, not
        // the geometric center of the element. That way casual contact
        // anywhere inside the joystick is treated as neutral — only an
        // intentional drag from the touch origin counts as input. Fixes
        // the case where the player's thumb naturally lands in the lower
        // half of the joystick and the car immediately reverses.
        this.time.on('tick', () =>
        {
            if(!joy.active) return

            const dx = joy.current.x - joy.origin.x
            const dy = joy.current.y - joy.origin.y
            const DZ = 14   // deadzone in px (relative to touch origin)

            const left  = dx < -DZ
            const right = dx >  DZ
            const up    = dy < -DZ
            const down  = dy >  DZ

            // Refcount: joystick is one of several sources of up/down
            if(up)   this._upHeldBy.add('joystick');   else this._upHeldBy.delete('joystick')
            if(down) this._downHeldBy.add('joystick'); else this._downHeldBy.delete('joystick')
            const newUp   = this._upHeldBy.size   > 0
            const newDown = this._downHeldBy.size > 0

            const changed =
                left   !== this.actions.left  ||
                right  !== this.actions.right ||
                newUp  !== this.actions.up    ||
                newDown !== this.actions.down

            this.actions.left  = left
            this.actions.right = right
            this.actions.up    = newUp
            this.actions.down  = newDown

            if(changed) this._sendInput()

            // Cursor visualization: also relative to origin so the visual
            // matches where the user feels their thumb has moved
            const dist = Math.min(Math.hypot(dx, dy), 50)
            const ang  = Math.atan2(dy, dx)
            joy.$cursor.style.transform =
                `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`
        })

        // Touchstart: snapshot the landing point as the new origin so the
        // first frame doesn't read any deflection from a casual contact.
        $j.addEventListener('touchstart', (e) =>
        {
            e.preventDefault()
            const t = e.changedTouches[0]
            if(!t) return
            joy.active    = true
            joy.touchId   = t.identifier
            joy.origin.x  = t.clientX
            joy.origin.y  = t.clientY
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

            // Clear joystick's contribution to refcounted up/down
            this._upHeldBy.delete('joystick')
            this._downHeldBy.delete('joystick')
            const newUp   = this._upHeldBy.size   > 0
            const newDown = this._downHeldBy.size > 0

            let changed = false
            if(this.actions.left)              { this.actions.left  = false; changed = true }
            if(this.actions.right)             { this.actions.right = false; changed = true }
            if(this.actions.up   !== newUp)    { this.actions.up    = newUp;  changed = true }
            if(this.actions.down !== newDown)  { this.actions.down  = newDown; changed = true }
            if(changed) this._sendInput()
        }
        document.addEventListener('touchend',    releaseJoy)
        document.addEventListener('touchcancel', releaseJoy)
    }

    // ── Right-thumb action buttons ───────────────────────────────────────
    // Bottom-up: backward · brake · forward · boost (Bruno's original 4)
    //            + jump · fire (new — text labels)
    _buildTouchButtons()
    {
        // Hold-style button with a PNG icon (original aesthetic)
        const makeIconHold = (id, iconUrl, iconRotate, slot, onPress, onRelease, accent) =>
        {
            const $b = document.createElement('button')
            $b.className = 'rl-touch-btn rl-touch-btn-icon'
            $b.id = `rl-touch-${id}`
            $b.dataset.slot = String(slot)
            if(accent) $b.dataset.accent = accent

            const $img = document.createElement('img')
            $img.src = iconUrl
            $img.alt = id
            $img.draggable = false
            if(iconRotate) $img.style.transform = `rotate(${iconRotate}deg)`
            $b.appendChild($img)

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

        // Tap-style button with a text label (new actions: jump, fire)
        const makeTextTap = (id, label, slot, onTap, accent, hidden = false) =>
        {
            const $b = document.createElement('button')
            $b.className = 'rl-touch-btn rl-touch-btn-text'
            $b.id = `rl-touch-${id}`
            $b.dataset.slot = String(slot)
            if(accent) $b.dataset.accent = accent
            if(hidden) $b.style.display = 'none'
            $b.textContent = label
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

        // Slots 0-3: original Bruno layout. Slots 4-5: new actions.
        //
        // Multi-source conflict guard: forward + boost + joystick can all
        // drive actions.up. Each source adds/removes itself from a Set;
        // the action is true while the set is non-empty.
        const setHeld = (set, source, action, held) =>
        {
            if(held) set.add(source); else set.delete(source)
            const newVal = set.size > 0
            if(this.actions[action] !== newVal)
            {
                this.actions[action] = newVal
                this._sendInput()
            }
        }

        // Slot 0 (bottom): backward — triangle rotated 180°
        this.touch.backward = makeIconHold('backward', mobileTriangle, 180, 0,
            () => { setHeld(this._downHeldBy, 'backward', 'down', true);  this.camera?.pan?.reset?.() },
            () => { setHeld(this._downHeldBy, 'backward', 'down', false) })

        // Slot 1: brake — cross
        this.touch.brake = makeIconHold('brake', mobileCross, 0, 1,
            () => { this.actions.brake = true;  this._sendInput() },
            () => { this.actions.brake = false; this._sendInput() })

        // Slot 2: forward — triangle (gas pedal)
        this.touch.forward = makeIconHold('forward', mobileTriangle, 0, 2,
            () => { setHeld(this._upHeldBy, 'forward', 'up', true);  this.camera?.pan?.reset?.() },
            () => { setHeld(this._upHeldBy, 'forward', 'up', false) })

        // Slot 3: boost — double triangle (boost = up + boost)
        this.touch.boost = makeIconHold('boost', mobileDoubleTriangle, 0, 3,
            () =>
            {
                setHeld(this._upHeldBy, 'boost', 'up', true)
                this.actions.boost = true
                this.camera?.pan?.reset?.()
                this._sendInput()
            },
            () =>
            {
                setHeld(this._upHeldBy, 'boost', 'up', false)
                this.actions.boost = false
                this._sendInput()
            },
            'amber')

        // Slot 4: jump (new) — text label, cyan accent
        this.touch.jump = makeTextTap('jump', 'JUMP', 4,
            () => this.trigger('action', ['jump']),
            'cyan')

        // Slot 5: fire (new) — text label, redline accent, combat-mode only
        this.touch.fire = makeTextTap('fire', 'FIRE', 5,
            () => this.trigger('action', ['fire']),
            'redline',
            true)
    }
}
