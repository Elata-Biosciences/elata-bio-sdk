package com.example.eegdemo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.example.eegdemo.ui.theme.EegDemoTheme
import uniffi.eeg_ffi.*
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            EegDemoTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    EegDemoScreen()
                }
            }
        }
    }
}

@Composable
fun EegDemoScreen() {
    var alphaState by remember { mutableStateOf("Unknown") }
    var calmnessScore by remember { mutableStateOf(0f) }
    var bandPowers by remember { mutableStateOf<BandPowers?>(null) }
    var isProcessing by remember { mutableStateOf(false) }
    var sdkVersion by remember { mutableStateOf("") }

    // Initialize SDK components
    val processor = remember { SignalProcessor(256u) }
    val detector = remember { AlphaBumpDetector(256u, 4u) }
    val calmnessModel = remember { CalmnessModel(256u, 4u) }

    // Get SDK version on launch
    LaunchedEffect(Unit) {
        sdkVersion = getVersion()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Text(
            text = "EEG SDK Demo",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "SDK Version: $sdkVersion",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // Status Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "EEG Status",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(if (isProcessing) Color.Green else Color.Gray)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isProcessing) "Processing" else "Idle",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Alpha State Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Alpha State",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = alphaState,
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = when (alphaState) {
                        "HIGH" -> Color(0xFF4CAF50)
                        "LOW" -> Color(0xFFFF9800)
                        "TRANSITIONING" -> Color(0xFFFFEB3B)
                        else -> Color.Gray
                    }
                )
            }
        }

        // Calmness Score Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Calmness Score",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "${(calmnessScore * 100).toInt()}%",
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    LinearProgressIndicator(
                        progress = { calmnessScore },
                        modifier = Modifier
                            .weight(1f)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                    )
                }
            }
        }

        // Band Powers Card
        bandPowers?.let { powers ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "Band Powers",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    BandPowerRow("Delta", powers.delta, Color(0xFF9C27B0))
                    BandPowerRow("Theta", powers.theta, Color(0xFF2196F3))
                    BandPowerRow("Alpha", powers.alpha, Color(0xFF4CAF50))
                    BandPowerRow("Beta", powers.beta, Color(0xFFFF9800))
                    BandPowerRow("Gamma", powers.gamma, Color(0xFFF44336))
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Simulate Button
        Button(
            onClick = {
                isProcessing = true

                // Generate synthetic EEG data
                val sampleRate = 256f
                val duration = 1f
                val sampleCount = (sampleRate * duration).toInt()
                val channelCount = 4

                val interleavedData = mutableListOf<Float>()
                for (i in 0 until sampleCount) {
                    val t = i / sampleRate
                    for (c in 0 until channelCount) {
                        // Generate signal with alpha (10 Hz) dominant
                        val alpha = sin(2 * PI * 10 * t).toFloat() * 10f
                        val beta = sin(2 * PI * 20 * t).toFloat() * 3f
                        val theta = sin(2 * PI * 6 * t).toFloat() * 5f
                        val noise = Random.nextFloat() * 4f - 2f
                        interleavedData.add(alpha + beta + theta + noise)
                    }
                }

                try {
                    // Get band powers from single channel
                    val singleChannel = interleavedData.filterIndexed { index, _ -> index % channelCount == 0 }
                    bandPowers = processor.computeBandPowers(singleChannel)

                    // Process alpha bump detection
                    val alphaResult = detector.process(interleavedData)
                    alphaResult?.let {
                        alphaState = it.state.name
                    }

                    // Process calmness model
                    val calmnessResult = calmnessModel.process(interleavedData)
                    calmnessResult?.let {
                        calmnessScore = it.smoothedScore
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                isProcessing = false
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Simulate EEG Data")
        }
    }
}

@Composable
fun BandPowerRow(name: String, value: Float, color: Color) {
    val maxValue = 50f

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = name,
            modifier = Modifier.width(60.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth((value / maxValue).coerceIn(0f, 1f))
                    .background(color)
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = String.format("%.1f", value),
            modifier = Modifier.width(40.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Preview(showBackground = true)
@Composable
fun EegDemoScreenPreview() {
    EegDemoTheme {
        EegDemoScreen()
    }
}
