package org.tamx.termigate.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.tamx.termigate.data.model.QuickAction
import org.tamx.termigate.data.network.ApiClient
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConfigRepository @Inject constructor(
    private val apiClient: ApiClient,
    private val prefs: AppPreferences
) {
    private val json = Json { ignoreUnknownKeys = true }

    private val _quickActions = MutableStateFlow<List<QuickAction>>(loadCachedQuickActions())
    val quickActions: StateFlow<List<QuickAction>> = _quickActions.asStateFlow()

    suspend fun fetchQuickActions(): Result<List<QuickAction>> {
        return apiClient.getQuickActions().also { result ->
            result.onSuccess { actions ->
                _quickActions.value = actions
                cacheQuickActions(actions)
            }
        }
    }

    suspend fun createQuickAction(action: QuickAction): Result<List<QuickAction>> {
        return apiClient.createQuickAction(action).also { result ->
            result.onSuccess { actions ->
                _quickActions.value = actions
                cacheQuickActions(actions)
            }
        }
    }

    suspend fun updateQuickAction(id: String, action: QuickAction): Result<List<QuickAction>> {
        return apiClient.updateQuickAction(id, action).also { result ->
            result.onSuccess { actions ->
                _quickActions.value = actions
                cacheQuickActions(actions)
            }
        }
    }

    suspend fun deleteQuickAction(id: String): Result<Unit> {
        return apiClient.deleteQuickAction(id).also { result ->
            result.onSuccess {
                _quickActions.value = _quickActions.value.filter { it.id != id }
                cacheQuickActions(_quickActions.value)
            }
        }
    }

    suspend fun reorderQuickActions(ids: List<String>): Result<List<QuickAction>> {
        return apiClient.reorderQuickActions(ids).also { result ->
            result.onSuccess { actions ->
                _quickActions.value = actions
                cacheQuickActions(actions)
            }
        }
    }

    private fun cacheQuickActions(actions: List<QuickAction>) {
        prefs.quickActionsCache = json.encodeToString(actions)
    }

    private fun loadCachedQuickActions(): List<QuickAction> {
        val cached = prefs.quickActionsCache ?: return emptyList()
        return try {
            json.decodeFromString<List<QuickAction>>(cached)
        } catch (_: Exception) {
            emptyList()
        }
    }
}
