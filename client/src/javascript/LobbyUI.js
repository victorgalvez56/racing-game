import { CAR_COLORS } from '../../../shared/constants.js'

export default class LobbyUI
{
    constructor(_options)
    {
        this.network     = _options.network   // null in solo mode
        this.config      = _options.config
        this._onSoloJoin = _options.onSoloJoin || null

        this.$lobby   = document.getElementById('lobby')
        this.$hud     = document.getElementById('mp-hud')
        this.$toast   = document.getElementById('mp-toast')
        this.$ping    = document.getElementById('mp-ping')
        this.$pingDot = document.getElementById('mp-ping-dot')
        this.$pingVal = document.getElementById('mp-ping-val')

        this._pingTimer    = null
        this._pingConnected = false

        this._toastTimer  = null
        this._onlineCount = 1

        // Load saved config from localStorage, fall back to defaults
        const saved    = this._loadSaved()
        this._name     = saved.name     || ''
        this._colorIdx = saved.colorIdx ?? 0
        this._carType  = saved.carType  || 'default'
        this._step     = 0

        this._buildColorGrid()
        this._bindLobbyEvents()
        this._restoreSavedUI()
        this._setupQuickPlay()
        this._setupNetworkEvents()
    }

    // ─── Persistence ─────────────────────────────────────────────────────────

    _loadSaved()
    {
        try { return JSON.parse(localStorage.getItem('rg:playerConfig') || '{}') }
        catch { return {} }
    }

    _save()
    {
        localStorage.setItem('rg:playerConfig', JSON.stringify({
            name:     this._name,
            colorIdx: this._colorIdx,
            carType:  this._carType,
        }))
    }

    _restoreSavedUI()
    {
        // Name
        if(this._name)
        {
            document.getElementById('lobby-name').value = this._name
        }

        // Color swatch
        this._selectColor(this._colorIdx)

        // Car type
        document.querySelectorAll('.car-option').forEach(el =>
        {
            el.classList.toggle('selected', el.dataset.type === this._carType)
        })
    }

    // ─── Build ───────────────────────────────────────────────────────────────

    _buildColorGrid()
    {
        const grid = document.getElementById('color-grid')
        CAR_COLORS.forEach((hex, i) =>
        {
            const swatch = document.createElement('div')
            swatch.className = 'color-swatch' + (i === 0 ? ' selected' : '')
            swatch.style.background = hex
            swatch.dataset.idx = i
            swatch.addEventListener('click', () => this._selectColor(i))
            grid.appendChild(swatch)
        })
    }

    _selectColor(idx)
    {
        this._colorIdx = idx
        document.querySelectorAll('.color-swatch').forEach((s, i) =>
        {
            s.classList.toggle('selected', i === idx)
        })
    }

    // ─── Quick-play ──────────────────────────────────────────────────────────

    _setupQuickPlay()
    {
        if(!this._name) return

        const $qp   = document.getElementById('quick-play')
        const $name = document.getElementById('quick-play-name')
        const $btn  = document.getElementById('btn-quick-play')
        const $chg  = document.getElementById('btn-change-settings')

        if(!$qp || !$btn) return

        $name.textContent = this._name
        $qp.style.display = 'block'

        // Hide the normal name-input + next button when quick-play is shown
        document.getElementById('lobby-name').style.display    = 'none'
        document.getElementById('btn-name-next').style.display = 'none'

        $btn.addEventListener('click', () => this._submit())

        $chg.addEventListener('click', () =>
        {
            $qp.style.display                                      = 'none'
            document.getElementById('lobby-name').style.display    = ''
            document.getElementById('btn-name-next').style.display = ''
            document.getElementById('lobby-name').focus()
        })
    }

    // ─── Step navigation ─────────────────────────────────────────────────────

    _bindLobbyEvents()
    {
        const nameInput    = document.getElementById('lobby-name')
        const btnNameNext  = document.getElementById('btn-name-next')
        const btnColorBack = document.getElementById('btn-color-back')
        const btnColorNext = document.getElementById('btn-color-next')
        const btnCarBack   = document.getElementById('btn-car-back')
        const btnPlay      = document.getElementById('btn-play')

        // Allow Enter key on name field
        nameInput.addEventListener('keydown', (e) =>
        {
            if(e.key === 'Enter') btnNameNext.click()
        })

        btnNameNext.addEventListener('click', () =>
        {
            const val = nameInput.value.trim()
            if(!val) { nameInput.focus(); return }
            this._name = val
            this._goToStep(1)
        })

        btnColorBack.addEventListener('click', () => this._goToStep(0))
        btnColorNext.addEventListener('click', () => this._goToStep(2))

        btnCarBack.addEventListener('click', () => this._goToStep(1))

        document.querySelectorAll('.car-option').forEach(el =>
        {
            el.addEventListener('click', () =>
            {
                document.querySelectorAll('.car-option').forEach(o => o.classList.remove('selected'))
                el.classList.add('selected')
                this._carType = el.dataset.type
            })
        })

        btnPlay.addEventListener('click', () => this._submit())

        // Focus name input immediately
        nameInput.focus()
    }

    _goToStep(n)
    {
        document.getElementById(`step-${this._step}`).classList.remove('active')
        this._step = n
        document.getElementById(`step-${n}`).classList.add('active')

        // Update dots
        document.querySelectorAll('.lobby-dot').forEach((d, i) =>
        {
            d.classList.toggle('active', i === n)
        })

        // Update label
        document.getElementById('lobby-step-label').textContent = `Step ${n + 1} of 3`

        // When returning to step 0, ensure name input is visible
        if(n === 0)
        {
            document.getElementById('quick-play').style.display    = 'none'
            document.getElementById('lobby-name').style.display    = ''
            document.getElementById('btn-name-next').style.display = ''
            document.getElementById('lobby-name').focus()
        }
    }

    _submit()
    {
        this._save()
        this.config.cyberTruck  = (this._carType === 'cybertruck')
        this.config.carColor    = this._colorIdx
        this.config.playerName  = this._name
        this.$lobby.classList.add('hidden')

        if(this.network)
        {
            this.network.join(this._name, this._colorIdx, this._carType)
        }
        else
        {
            // Solo mode: show hud locally and notify world to start
            if(this.$hud)
            {
                this.$hud.style.display = 'block'
                this._updateHUD()
            }
            this._onSoloJoin?.()
        }
    }

    // ─── Network events ───────────────────────────────────────────────────────

    _setupNetworkEvents()
    {
        if(!this.network) return

        this.network.on('connected', () =>
        {
            this._pingConnected = true
            this._startPingHUD()
        })

        this.network.on('disconnected', () =>
        {
            this._pingConnected = false
            this._renderPing(null)
            this.showToast('Connection lost — reconnecting...')
        })

        this.network.on('room:joined', ({ existingPlayers }) =>
        {
            this._onlineCount = existingPlayers.length + 1
            this.$hud.style.display = 'block'
            this._updateHUD()
        })

        this.network.on('room:full', () =>
        {
            // Show lobby again so user can try later
            this.$lobby.classList.remove('hidden')
            this.showToast('Room is full — try again later')
        })

        this.network.on('player:joined', ({ name }) =>
        {
            this._onlineCount++
            this._updateHUD()
            this.showToast(`${name} joined`)
        })

        this.network.on('player:left', () =>
        {
            this._onlineCount = Math.max(1, this._onlineCount - 1)
            this._updateHUD()
        })
    }

    _updateHUD()
    {
        if(this.$hud) this.$hud.textContent = `${this._onlineCount} online`
    }

    _startPingHUD()
    {
        if(!this.$ping || this._pingTimer) return
        this.$ping.style.display = 'flex'
        this._renderPing(this.network?.latency ?? null)
        this._pingTimer = setInterval(() =>
        {
            this._renderPing(this._pingConnected ? (this.network?.latency ?? null) : null)
        }, 1000)
    }

    _renderPing(ms)
    {
        if(!this.$ping) return

        // Disconnected state
        if(!this._pingConnected || ms === null)
        {
            this.$pingDot.style.background = '#e74c3c'
            this.$pingDot.style.boxShadow  = '0 0 6px rgba(231,76,60,0.6)'
            this.$pingVal.textContent      = 'offline'
            return
        }

        // First measurement not in yet
        if(ms === 0)
        {
            this.$pingDot.style.background = '#888'
            this.$pingDot.style.boxShadow  = '0 0 6px rgba(255,255,255,0.15)'
            this.$pingVal.textContent      = '-- ms'
            return
        }

        let color, glow
        if(ms < 60)        { color = '#2ecc71'; glow = 'rgba(46,204,113,0.55)' }
        else if(ms < 140)  { color = '#f1c40f'; glow = 'rgba(241,196,15,0.55)' }
        else               { color = '#e74c3c'; glow = 'rgba(231,76,60,0.55)' }

        this.$pingDot.style.background = color
        this.$pingDot.style.boxShadow  = `0 0 6px ${glow}`
        this.$pingVal.textContent      = `${ms} ms`
    }

    showToast(message, duration = 3000)
    {
        clearTimeout(this._toastTimer)
        this.$toast.textContent   = message
        this.$toast.style.display = 'block'
        this._toastTimer = setTimeout(() =>
        {
            this.$toast.style.display = 'none'
        }, duration)
    }
}
