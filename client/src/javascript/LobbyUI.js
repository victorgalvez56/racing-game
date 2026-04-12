/**
 * LobbyUI
 * Auto-joins on connect with a random colour. Shows online count HUD and toasts.
 */
export default class LobbyUI
{
    constructor(_options)
    {
        this.network = _options.network

        this.$hud   = document.getElementById('mp-hud')
        this.$toast = document.getElementById('mp-toast')

        this._toastTimer  = null
        this._onlineCount = 1  // local player always counts

        this._setupNetworkEvents()
    }

    _setupNetworkEvents()
    {
        this.network.on('connected', () =>
        {
            const carColor = Math.floor(Math.random() * 8)
            this.network.join('Anonymous', carColor)
        })

        this.network.on('disconnected', () =>
        {
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
        this.$hud.textContent = `${this._onlineCount} online`
    }

    showToast(message, duration = 3000)
    {
        clearTimeout(this._toastTimer)
        this.$toast.textContent  = message
        this.$toast.style.display = 'block'
        this._toastTimer = setTimeout(() =>
        {
            this.$toast.style.display = 'none'
        }, duration)
    }
}
