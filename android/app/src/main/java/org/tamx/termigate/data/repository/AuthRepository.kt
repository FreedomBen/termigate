package org.tamx.termigate.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.tamx.termigate.data.network.ApiClient
import org.tamx.termigate.data.network.AuthEvent
import org.tamx.termigate.data.network.AuthPluginConfig
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiClient: ApiClient,
    private val prefs: AppPreferences,
    private val authPluginConfig: AuthPluginConfig
) {
    private val _isAuthenticated = MutableStateFlow(prefs.authToken != null)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private val _authRequired = MutableStateFlow<Boolean?>(null)
    val authRequired: StateFlow<Boolean?> = _authRequired.asStateFlow()

    val authEvents = authPluginConfig.events

    suspend fun login(serverUrl: String, username: String, password: String): Result<Unit> {
        prefs.serverUrl = serverUrl.trimEnd('/')
        prefs.lastUsername = username

        val result = apiClient.login(username, password)
        return result.map { response ->
            prefs.authToken = response.token
            _isAuthenticated.value = true
        }
    }

    suspend fun probeAuthRequired(serverUrl: String): Boolean {
        prefs.serverUrl = serverUrl.trimEnd('/')
        val required = apiClient.probeAuthRequired()
        _authRequired.value = required
        if (!required) {
            _isAuthenticated.value = true
        }
        return required
    }

    fun getToken(): String? = prefs.authToken

    fun clearToken() {
        prefs.authToken = null
        _isAuthenticated.value = false
    }

    fun getServerUrl(): String? = prefs.serverUrl

    fun getLastUsername(): String? = prefs.lastUsername
}
