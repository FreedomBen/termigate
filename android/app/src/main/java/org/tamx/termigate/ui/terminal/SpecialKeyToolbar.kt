package org.tamx.termigate.ui.terminal

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SpecialKeyToolbar(
    onSendInput: (ByteArray) -> Unit,
    modifier: Modifier = Modifier
) {
    var ctrlActive by remember { mutableStateOf(false) }
    var altActive by remember { mutableStateOf(false) }
    var showExtended by remember { mutableStateOf(false) }
    val context = LocalContext.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerHigh
    ) {
        Column {
            // Extended keys row (F1-F12, PgUp/PgDn, Home/End)
            AnimatedVisibility(
                visible = showExtended,
                enter = slideInVertically { it },
                exit = slideOutVertically { it }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    for (i in 1..12) {
                        ToolbarKey("F$i") { onSendInput(fKeyBytes(i)) }
                    }
                    ToolbarKey("Home") { onSendInput(byteArrayOf(0x1b, '['.code.toByte(), 'H'.code.toByte())) }
                    ToolbarKey("End") { onSendInput(byteArrayOf(0x1b, '['.code.toByte(), 'F'.code.toByte())) }
                    ToolbarKey("PgUp") { onSendInput(byteArrayOf(0x1b, '['.code.toByte(), '5'.code.toByte(), '~'.code.toByte())) }
                    ToolbarKey("PgDn") { onSendInput(byteArrayOf(0x1b, '['.code.toByte(), '6'.code.toByte(), '~'.code.toByte())) }
                    ToolbarKey("Ins") { onSendInput(byteArrayOf(0x1b, '['.code.toByte(), '2'.code.toByte(), '~'.code.toByte())) }
                    ToolbarKey("Del") { onSendInput(byteArrayOf(0x1b, '['.code.toByte(), '3'.code.toByte(), '~'.code.toByte())) }
                }
            }

            // Main keys row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                ToolbarKey("Esc") {
                    onSendInput(applyModifiers(byteArrayOf(0x1b), ctrlActive, altActive))
                    ctrlActive = false; altActive = false
                }
                ToolbarKey("Tab") {
                    onSendInput(applyModifiers(byteArrayOf(0x09), ctrlActive, altActive))
                    ctrlActive = false; altActive = false
                }
                ToolbarKey(
                    label = "Ctrl",
                    isActive = ctrlActive
                ) { ctrlActive = !ctrlActive }
                ToolbarKey(
                    label = "Alt",
                    isActive = altActive
                ) { altActive = !altActive }
                ToolbarKey("\u2191") {
                    onSendInput(byteArrayOf(0x1b, '['.code.toByte(), 'A'.code.toByte()))
                }
                ToolbarKey("\u2193") {
                    onSendInput(byteArrayOf(0x1b, '['.code.toByte(), 'B'.code.toByte()))
                }
                ToolbarKey("\u2190") {
                    onSendInput(byteArrayOf(0x1b, '['.code.toByte(), 'D'.code.toByte()))
                }
                ToolbarKey("\u2192") {
                    onSendInput(byteArrayOf(0x1b, '['.code.toByte(), 'C'.code.toByte()))
                }
                ToolbarKey("Paste") {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    val text = clipboard.primaryClip?.getItemAt(0)?.text?.toString() ?: return@ToolbarKey
                    onSendInput(text.toByteArray(Charsets.UTF_8))
                }
                ToolbarKey(if (showExtended) "\u25BC" else "\u25B2") {
                    showExtended = !showExtended
                }
            }
        }
    }
}

@Composable
private fun ToolbarKey(
    label: String,
    isActive: Boolean = false,
    onClick: () -> Unit
) {
    TextButton(
        onClick = onClick,
        modifier = Modifier.height(40.dp)
    ) {
        Text(
            text = label,
            fontFamily = FontFamily.Monospace,
            fontSize = 12.sp,
            color = if (isActive) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurface
            }
        )
    }
}

/** Apply Ctrl modifier: bitwise AND with 0x1f for single-byte values */
private fun applyModifiers(bytes: ByteArray, ctrl: Boolean, alt: Boolean): ByteArray {
    if (!ctrl && !alt) return bytes
    val result = bytes.copyOf()
    if (ctrl && result.size == 1) {
        // Ctrl: mask with 0x1f (e.g., Ctrl+C = 0x03)
        result[0] = (result[0].toInt() and 0x1f).toByte()
    }
    if (alt && result.isNotEmpty()) {
        // Alt: prepend ESC
        return byteArrayOf(0x1b) + result
    }
    return result
}

/** Generate F-key escape sequence */
private fun fKeyBytes(n: Int): ByteArray {
    val code = when (n) {
        1 -> "OP"
        2 -> "OQ"
        3 -> "OR"
        4 -> "OS"
        5 -> "[15~"
        6 -> "[17~"
        7 -> "[18~"
        8 -> "[19~"
        9 -> "[20~"
        10 -> "[21~"
        11 -> "[23~"
        12 -> "[24~"
        else -> return byteArrayOf()
    }
    return ("\u001b$code").toByteArray(Charsets.US_ASCII)
}
