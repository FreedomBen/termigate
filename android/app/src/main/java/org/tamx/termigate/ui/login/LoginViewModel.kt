package org.tamx.termigate.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.tamx.termigate.data.repository.AuthRepository
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    data class UiState(
        val serverUrl: String = "",
        val username: String = "",
        val password: String = "",
        val isLoading: Boolean = false,
        val error: String? = null,
        val loginSuccess: Boolean = false
    )

    private val _uiState = MutableStateFlow(
        UiState(
            serverUrl = authRepository.getServerUrl() ?: "",
            username = authRepository.getLastUsername() ?: ""
        )
    )
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun onServerUrlChanged(url: String) {
        _uiState.update { it.copy(serverUrl = url, error = null) }
    }

    fun onUsernameChanged(username: String) {
        _uiState.update { it.copy(username = username, error = null) }
    }

    fun onPasswordChanged(password: String) {
        _uiState.update { it.copy(password = password, error = null) }
    }

    fun onLoginClicked() {
        val state = _uiState.value
        if (state.serverUrl.isBlank()) {
            _uiState.update { it.copy(error = "Server URL is required") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            // First probe if auth is required
            try {
                val authRequired = authRepository.probeAuthRequired(state.serverUrl)
                if (!authRequired) {
                    _uiState.update { it.copy(isLoading = false, loginSuccess = true) }
                    return@launch
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = errorMessage(e))
                }
                return@launch
            }

            // Auth is required — validate fields
            if (state.username.isBlank() || state.password.isBlank()) {
                _uiState.update {
                    it.copy(isLoading = false, error = "Username and password are required")
                }
                return@launch
            }

            // Attempt login
            authRepository.login(state.serverUrl, state.username, state.password)
                .onSuccess {
                    _uiState.update { it.copy(isLoading = false, loginSuccess = true) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(isLoading = false, error = errorMessage(e))
                    }
                }
        }
    }

    private fun errorMessage(e: Throwable): String = when (e) {
        is SocketTimeoutException -> "Connection timed out"
        is ConnectException -> "Could not connect to server"
        is UnknownHostException -> "Server not found"
        is io.ktor.client.plugins.ClientRequestException -> {
            when (e.response.status.value) {
                401 -> "Invalid username or password"
                429 -> "Too many attempts. Please try again later."
                else -> "Server error (${e.response.status.value})"
            }
        }
        else -> e.message ?: "Unknown error"
    }
}
