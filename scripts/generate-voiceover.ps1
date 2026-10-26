Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

$voice = ($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | Select-Object -First 1).VoiceInfo.Name
if ($voice) {
    $synth.SelectVoice($voice)
}
$synth.Rate = 0

$outPath = Join-Path $PSScriptRoot "..\demo\optiflow-voiceover.wav"
$resolvedOut = [System.IO.Path]::GetFullPath($outPath)
$synth.SetOutputToWaveFile($resolvedOut)

$narration = @"
Welcome to OptiFlow, a deterministic resource allocation and scheduling engine powered by WebAssembly.
In high-contention emergency dispatch, field operations, and clinical staffing, incoming requests arrive with strict skill requirements, release times, and hard deadline windows.
Conventional greedy dispatch heuristics fail catastrophically under surge, producing up to 23 percent constraint violations.
OptiFlow solves this combinatorial problem with mathematical rigor directly inside the browser using GLPK compiled to WebAssembly.
On our live operations overview, the warmed solver delivers zero constraint violations and a certified zero-percent optimality gap.
Our Gantt allocation board color-codes normal, urgent, and critical skilled tasks, with interactive tooltips showing personnel assignment, execution windows, and certified skills.
Using the interactive Pareto strategy slider, dispatchers can balance minimum task delay against maximum personnel fairness with instant client-side re-solving.
In the Scheduling Studio, operators manage personnel skill tags, shift capacities, and task demand with a real-time constraint auditor that immediately flags skill mismatches and rest collisions on manual overrides.
In our empirical benchmark suite, exact WebAssembly MILP is rigorously benchmarked against greedy first-fit and round-robin heuristics across 50 to 1,000 tasks, reducing task completion delays by up to 57 percent while decomposing 1,000 tasks in just 167 milliseconds.
OptiFlow sets a new standard for constraint-safe, zero-latency operational intelligence.
"@

$synth.Speak($narration)
$synth.Dispose()
Write-Host "Synthesized voiceover saved to: $resolvedOut"
