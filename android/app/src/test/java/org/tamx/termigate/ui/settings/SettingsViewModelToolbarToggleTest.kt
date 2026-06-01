package org.tamx.termigate.ui.settings

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.tamx.termigate.data.model.QuickAction
import org.tamx.termigate.data.repository.AppPreferences
import org.tamx.termigate.data.repository.AuthRepository
import org.tamx.termigate.data.repository.ConfigRepository

/**
 * The Mobile Control Bar toggle (web parity `7fbda47`/`486ea05`) must persist
 * to [AppPreferences] and apply immediately — the terminal screen observes the
 * preference flow, so there is no submit step.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelToolbarToggleTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var configRepo: ConfigRepository
    private lateinit var authRepo: AuthRepository
    private lateinit var appPrefs: AppPreferences

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        configRepo = mockk(relaxed = true)
        authRepo = mockk(relaxed = true)
        appPrefs = mockk(relaxed = true)
        every { configRepo.quickActions } returns MutableStateFlow(emptyList<QuickAction>())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initial_state_reflects_persisted_value() = runTest(dispatcher) {
        every { appPrefs.showToolbar } returns false
        val vm = SettingsViewModel(configRepo, authRepo, appPrefs)
        assertFalse(vm.uiState.value.showToolbar)
    }

    @Test
    fun toggling_off_persists_and_updates_state_immediately() = runTest(dispatcher) {
        every { appPrefs.showToolbar } returns true
        val vm = SettingsViewModel(configRepo, authRepo, appPrefs)
        assertTrue(vm.uiState.value.showToolbar)

        vm.onShowToolbarChanged(false)

        assertFalse("state updates without a submit step", vm.uiState.value.showToolbar)
        verify { appPrefs.showToolbar = false }
    }
}
