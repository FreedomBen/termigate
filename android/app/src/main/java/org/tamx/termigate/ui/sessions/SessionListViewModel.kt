package org.tamx.termigate.ui.sessions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.tamx.termigate.data.model.Session
import org.tamx.termigate.data.repository.SessionRepository
import javax.inject.Inject

data class SessionRenameState(
    val sessionName: String,
    val newName: String = ""
)

@HiltViewModel
class SessionListViewModel @Inject constructor(
    private val sessionRepo: SessionRepository
) : ViewModel() {

    data class UiState(
        val sessions: List<Session> = emptyList(),
        val isLoading: Boolean = true,
        val error: String? = null,
        val tmuxStatus: String? = null,
        val showCreateDialog: Boolean = false,
        val showRenameDialog: SessionRenameState? = null,
        val showDeleteConfirmation: String? = null
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        // Collect sessions from repository
        viewModelScope.launch {
            sessionRepo.sessions.collect { sessions ->
                _uiState.update {
                    it.copy(sessions = sessions, isLoading = false)
                }
            }
        }

        // Collect tmux status
        viewModelScope.launch {
            sessionRepo.tmuxStatus.collect { status ->
                _uiState.update { it.copy(tmuxStatus = status) }
            }
        }

        // Connect to session channel
        viewModelScope.launch {
            try {
                sessionRepo.connectSessionChannel()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Connection failed")
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        sessionRepo.disconnectSessionChannel()
    }

    fun onShowCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = true) }
    }

    fun onDismissCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = false) }
    }

    fun onCreateSession(name: String, command: String?) {
        _uiState.update { it.copy(showCreateDialog = false) }
        viewModelScope.launch {
            sessionRepo.createSession(name, command?.ifBlank { null })
                .onFailure { e ->
                    _uiState.update { it.copy(error = e.message) }
                }
        }
    }

    fun onShowDeleteConfirmation(sessionName: String) {
        _uiState.update { it.copy(showDeleteConfirmation = sessionName) }
    }

    fun onDismissDeleteConfirmation() {
        _uiState.update { it.copy(showDeleteConfirmation = null) }
    }

    fun onDeleteSession(name: String) {
        _uiState.update { it.copy(showDeleteConfirmation = null) }
        viewModelScope.launch {
            sessionRepo.deleteSession(name).onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onShowRenameDialog(sessionName: String) {
        _uiState.update {
            it.copy(showRenameDialog = SessionRenameState(sessionName, sessionName))
        }
    }

    fun onDismissRenameDialog() {
        _uiState.update { it.copy(showRenameDialog = null) }
    }

    fun onRenameSession(oldName: String, newName: String) {
        _uiState.update { it.copy(showRenameDialog = null) }
        viewModelScope.launch {
            sessionRepo.renameSession(oldName, newName).onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onCreateWindow(sessionName: String) {
        viewModelScope.launch {
            sessionRepo.createWindow(sessionName).onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onSplitPane(target: String, direction: String) {
        viewModelScope.launch {
            sessionRepo.splitPane(target, direction).onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onDeletePane(target: String) {
        viewModelScope.launch {
            sessionRepo.deletePane(target).onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onRefresh() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            sessionRepo.refreshSessions()
                .onFailure { e ->
                    _uiState.update { it.copy(error = e.message) }
                }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun onDismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
