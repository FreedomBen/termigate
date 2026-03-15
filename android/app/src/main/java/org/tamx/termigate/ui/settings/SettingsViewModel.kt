package org.tamx.termigate.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.tamx.termigate.data.model.QuickAction
import org.tamx.termigate.data.repository.AppPreferences
import org.tamx.termigate.data.repository.AuthRepository
import org.tamx.termigate.data.repository.ConfigRepository
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val configRepo: ConfigRepository,
    private val authRepo: AuthRepository,
    private val appPrefs: AppPreferences
) : ViewModel() {

    data class UiState(
        val quickActions: List<QuickAction> = emptyList(),
        val fontSize: Int = 14,
        val keepScreenOn: Boolean = true,
        val vibrateOnKey: Boolean = true,
        val serverUrl: String = "",
        val isLoading: Boolean = false,
        val error: String? = null,
        val editingAction: QuickAction? = null,
        val loggedOut: Boolean = false
    )

    private val _uiState = MutableStateFlow(
        UiState(
            fontSize = appPrefs.fontSize,
            keepScreenOn = appPrefs.keepScreenOn,
            vibrateOnKey = appPrefs.vibrateOnKey,
            serverUrl = appPrefs.serverUrl ?: ""
        )
    )
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            configRepo.quickActions.collect { actions ->
                _uiState.update { it.copy(quickActions = actions) }
            }
        }
        viewModelScope.launch {
            configRepo.fetchQuickActions()
        }
    }

    fun onAddAction() {
        _uiState.update {
            it.copy(editingAction = QuickAction(label = "", command = ""))
        }
    }

    fun onEditAction(action: QuickAction) {
        _uiState.update { it.copy(editingAction = action) }
    }

    fun onDismissEditAction() {
        _uiState.update { it.copy(editingAction = null) }
    }

    fun onSaveAction(action: QuickAction) {
        _uiState.update { it.copy(editingAction = null, isLoading = true) }
        viewModelScope.launch {
            val result = if (action.id != null) {
                configRepo.updateQuickAction(action.id, action)
            } else {
                configRepo.createQuickAction(action)
            }
            result.onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun onDeleteAction(id: String) {
        viewModelScope.launch {
            configRepo.deleteQuickAction(id).onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onFontSizeChanged(size: Int) {
        appPrefs.fontSize = size
        _uiState.update { it.copy(fontSize = size) }
    }

    fun onKeepScreenOnChanged(enabled: Boolean) {
        appPrefs.keepScreenOn = enabled
        _uiState.update { it.copy(keepScreenOn = enabled) }
    }

    fun onVibrateChanged(enabled: Boolean) {
        appPrefs.vibrateOnKey = enabled
        _uiState.update { it.copy(vibrateOnKey = enabled) }
    }

    fun onLogout() {
        authRepo.clearToken()
        _uiState.update { it.copy(loggedOut = true) }
    }

    fun onDismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
