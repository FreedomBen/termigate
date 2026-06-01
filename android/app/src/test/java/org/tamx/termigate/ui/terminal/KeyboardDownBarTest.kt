package org.tamx.termigate.ui.terminal

import android.app.Application
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The keyboard-down secondary control bar (web parity, `0822875`) must send the
 * raw keystrokes a user would otherwise have to raise the soft keyboard for.
 *
 * Override the test application to plain [Application] so Robolectric does not
 * try to wire up Hilt's @HiltAndroidApp graph.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class KeyboardDownBarTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun captureKey(label: String): ByteArray {
        var sent: ByteArray? = null
        composeTestRule.setContent {
            KeyboardDownBar(onSendInput = { sent = it })
        }
        composeTestRule.onNodeWithText(label).performClick()
        return sent ?: ByteArray(0)
    }

    @Test
    fun enter_sends_carriage_return() {
        assertArrayEquals(byteArrayOf(0x0d), captureKey("Enter"))
    }

    @Test
    fun space_sends_space() {
        assertArrayEquals(byteArrayOf(0x20), captureKey("Space"))
    }

    @Test
    fun backspace_sends_del() {
        assertArrayEquals(byteArrayOf(0x7f), captureKey("Bksp"))
    }

    @Test
    fun esc_sends_escape() {
        assertArrayEquals(byteArrayOf(0x1b), captureKey("Esc"))
    }

    /**
     * Local-scrollback controls (web parity, `49f9a93` / `84654fd`): a Scroll /
     * Exit Scroll toggle, with ▲/▼ page keys revealed only while paused.
     */
    @Test
    fun toggle_reads_scroll_when_inactive_and_invokes_callback() {
        var toggled = false
        composeTestRule.setContent {
            KeyboardDownBar(onSendInput = {}, onToggleScrollback = { toggled = true })
        }
        composeTestRule.onNodeWithText("Exit Scroll").assertDoesNotExist()
        composeTestRule.onNodeWithText("Scroll").performClick()
        assertTrue(toggled)
    }

    @Test
    fun page_keys_hidden_until_scrollback_active() {
        composeTestRule.setContent {
            KeyboardDownBar(onSendInput = {}, scrollbackActive = false)
        }
        composeTestRule.onNodeWithText("▲").assertDoesNotExist()
        composeTestRule.onNodeWithText("▼").assertDoesNotExist()
    }

    @Test
    fun active_scrollback_reads_exit_and_pages_up_and_down() {
        var up = false
        var down = false
        composeTestRule.setContent {
            KeyboardDownBar(
                onSendInput = {},
                scrollbackActive = true,
                onScrollUp = { up = true },
                onScrollDown = { down = true }
            )
        }
        composeTestRule.onNodeWithText("Exit Scroll").assertExists()
        composeTestRule.onNodeWithText("▲").performClick()
        composeTestRule.onNodeWithText("▼").performClick()
        assertTrue(up)
        assertTrue(down)
    }
}
