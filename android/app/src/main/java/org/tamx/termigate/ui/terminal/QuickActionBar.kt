package org.tamx.termigate.ui.terminal

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.tamx.termigate.data.model.QuickAction

@Composable
fun QuickActionBar(
    quickActions: List<QuickAction>,
    onActionExecute: (QuickAction) -> Unit,
    modifier: Modifier = Modifier
) {
    if (quickActions.isEmpty()) return

    var collapsed by remember { mutableStateOf(false) }
    var confirmAction by remember { mutableStateOf<QuickAction?>(null) }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLow
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Collapse toggle
            TextButton(
                onClick = { collapsed = !collapsed },
                modifier = Modifier.height(32.dp)
            ) {
                Text(
                    text = if (collapsed) "\u25B6" else "\u25C0",
                    fontSize = 10.sp
                )
            }

            AnimatedVisibility(
                visible = !collapsed,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState())
                ) {
                    quickActions.forEach { action ->
                        Spacer(modifier = Modifier.width(4.dp))
                        QuickActionPill(
                            action = action,
                            onClick = {
                                if (action.confirm) {
                                    confirmAction = action
                                } else {
                                    onActionExecute(action)
                                }
                            }
                        )
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                }
            }
        }
    }

    // Confirmation dialog
    confirmAction?.let { action ->
        QuickActionConfirmDialog(
            action = action,
            onConfirm = {
                onActionExecute(action)
                confirmAction = null
            },
            onDismiss = { confirmAction = null }
        )
    }
}

@Composable
private fun QuickActionPill(
    action: QuickAction,
    onClick: () -> Unit
) {
    val containerColor = actionColor(action.color)
    val label = buildString {
        append(action.label)
        if (action.confirm) append(" \u26A0")
    }

    FilledTonalButton(
        onClick = onClick,
        modifier = Modifier.height(32.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.filledTonalButtonColors(
            containerColor = containerColor
        )
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun QuickActionConfirmDialog(
    action: QuickAction,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Run this command?") },
        text = {
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = action.command,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Run") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun actionColor(color: String): Color {
    return when (color) {
        "green" -> Color(0xFF2E7D32).copy(alpha = 0.3f)
        "red" -> Color(0xFFC62828).copy(alpha = 0.3f)
        "yellow" -> Color(0xFFF9A825).copy(alpha = 0.3f)
        "blue" -> Color(0xFF1565C0).copy(alpha = 0.3f)
        else -> Color.Unspecified
    }
}
