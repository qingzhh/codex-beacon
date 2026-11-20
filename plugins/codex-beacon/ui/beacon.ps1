param(
  [int]$Port = 17891
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$mutex = New-Object System.Threading.Mutex($false, 'Local\CodexBeacon.UI')
if (-not $mutex.WaitOne(0)) {
  exit 0
}

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Width="400" Height="286" Title="Codex Beacon"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="NoResize" ShowInTaskbar="False" Topmost="True"
        SnapsToDevicePixels="True" UseLayoutRounding="True"
        FontFamily="Microsoft YaHei UI">
  <Grid>
    <Border x:Name="Card" Margin="14" CornerRadius="26" BorderThickness="1">
      <Border.Background>
        <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
          <GradientStop Offset="0" Color="#F20C1117"/>
          <GradientStop Offset="0.58" Color="#F210161D"/>
          <GradientStop Offset="1" Color="#F20A0E13"/>
        </LinearGradientBrush>
      </Border.Background>
      <Border.BorderBrush>
        <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
          <GradientStop Offset="0" Color="#66FF9A68"/>
          <GradientStop Offset="0.45" Color="#332C3A48"/>
          <GradientStop Offset="1" Color="#555EEAD4"/>
        </LinearGradientBrush>
      </Border.BorderBrush>
      <Border.Effect>
        <DropShadowEffect Color="#FF7A45" BlurRadius="30" ShadowDepth="0" Opacity="0.22"/>
      </Border.Effect>

      <Grid Margin="18,15,16,14">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="132"/>
          <ColumnDefinition Width="*"/>
        </Grid.ColumnDefinitions>

        <Grid Grid.Column="0">
          <Grid.RowDefinitions>
            <RowDefinition Height="132"/>
            <RowDefinition Height="*"/>
          </Grid.RowDefinitions>

          <Canvas x:Name="Stage" Width="132" Height="132">
            <Canvas.RenderTransform>
              <TranslateTransform x:Name="FloatTransform"/>
            </Canvas.RenderTransform>

            <Ellipse Width="118" Height="118" Canvas.Left="7" Canvas.Top="7"
                     Stroke="#263440" StrokeThickness="1"
                     StrokeDashArray="2 7" Opacity="0.85"/>
            <Ellipse Width="96" Height="96" Canvas.Left="18" Canvas.Top="18"
                     Stroke="#1B2833" StrokeThickness="1"/>

            <Canvas x:Name="ContextTicks" Width="132" Height="132"/>

            <Ellipse x:Name="Glow" Width="98" Height="98" Canvas.Left="17" Canvas.Top="17"
                     Opacity="0.42">
              <Ellipse.Fill>
                <RadialGradientBrush>
                  <GradientStop Offset="0" Color="#AAFF9A68"/>
                  <GradientStop Offset="0.48" Color="#44FF7A45"/>
                  <GradientStop Offset="1" Color="#00FF7A45"/>
                </RadialGradientBrush>
              </Ellipse.Fill>
            </Ellipse>

            <Path Data="M66,8 L112,34 L112,90 L66,116 L20,90 L20,34 Z"
                  Stroke="#344453" StrokeThickness="1.4" Fill="Transparent"/>
            <Path x:Name="InnerHex"
                  Data="M66,25 L101,45 L101,81 L66,101 L31,81 L31,45 Z"
                  Stroke="#FF7A45" StrokeThickness="1.2" Opacity="0.78" Fill="#071015"/>

            <Canvas x:Name="CorePulse" Width="132" Height="132">
              <Canvas.RenderTransform>
                <ScaleTransform x:Name="CoreScale" CenterX="66" CenterY="66"/>
              </Canvas.RenderTransform>
              <Ellipse x:Name="CoreHalo" Width="30" Height="30" Canvas.Left="51" Canvas.Top="51"
                       Opacity="0.45">
                <Ellipse.Fill>
                  <RadialGradientBrush>
                    <GradientStop Offset="0" Color="#FFFFD8C2"/>
                    <GradientStop Offset="0.48" Color="#CCFF7A45"/>
                    <GradientStop Offset="1" Color="#00FF7A45"/>
                  </RadialGradientBrush>
                </Ellipse.Fill>
              </Ellipse>
              <Ellipse x:Name="Core" Width="18" Height="18" Canvas.Left="57" Canvas.Top="57" Fill="#FF7A45"/>
              <Ellipse Width="7" Height="7" Canvas.Left="62.5" Canvas.Top="62.5" Fill="#FFF4EA"/>
            </Canvas>

            <Canvas x:Name="OrbitA" Width="132" Height="132" RenderTransformOrigin="0.5,0.5">
              <Canvas.RenderTransform>
                <RotateTransform x:Name="OrbitARotate"/>
              </Canvas.RenderTransform>
              <Ellipse x:Name="OrbitADot" Width="6" Height="6" Canvas.Left="63" Canvas.Top="7" Fill="#5EEAD4"/>
            </Canvas>

            <Canvas x:Name="OrbitB" Width="132" Height="132" RenderTransformOrigin="0.5,0.5">
              <Canvas.RenderTransform>
                <RotateTransform x:Name="OrbitBRotate"/>
              </Canvas.RenderTransform>
              <Ellipse x:Name="OrbitBDot" Width="4" Height="4" Canvas.Left="116" Canvas.Top="64" Fill="#FFB27A"/>
            </Canvas>

            <Canvas x:Name="Sweep" Width="132" Height="132" RenderTransformOrigin="0.5,0.5">
              <Canvas.RenderTransform>
                <RotateTransform x:Name="SweepRotate"/>
              </Canvas.RenderTransform>
              <Line X1="66" Y1="66" X2="111" Y2="66" Stroke="#FF7A45" StrokeThickness="1.4" Opacity="0.38"/>
            </Canvas>

            <TextBlock x:Name="PulseLabel" Text="TX"
                       Canvas.Left="56" Canvas.Top="121"
                       FontFamily="Consolas" FontSize="8" Foreground="#6E8192"
                       TextAlignment="Center" Width="20"/>
          </Canvas>

          <StackPanel Grid.Row="1" Margin="0,2,8,0">
            <TextBlock x:Name="WorkspaceText" Text="CODEX SESSION"
                       FontFamily="Consolas" FontSize="10" FontWeight="SemiBold"
                       Foreground="#D7DFE8" TextTrimming="CharacterEllipsis"/>
            <TextBlock x:Name="ModelText" Text="Codex"
                       FontFamily="Consolas" FontSize="9" Foreground="#728496"
                       Margin="0,2,0,0" TextTrimming="CharacterEllipsis"/>
          </StackPanel>
        </Grid>

        <Grid Grid.Column="1">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
          </Grid.RowDefinitions>

          <Grid Grid.Row="0">
            <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
              <Ellipse x:Name="HeaderDot" Width="6" Height="6" Fill="#FF7A45" Margin="0,0,7,0"/>
              <TextBlock Text="CODEX BEACON" FontFamily="Consolas" FontSize="10"
                         FontWeight="Bold" Foreground="#F4B08F" VerticalAlignment="Center"/>
            </StackPanel>
            <Button x:Name="CloseButton" Content="&#x00D7;" HorizontalAlignment="Right"
                    VerticalAlignment="Center" Width="22" Height="22" Padding="0"
                    FontSize="15" Background="Transparent" BorderThickness="0"
                    Foreground="#738394" Cursor="Hand"/>
          </Grid>

          <StackPanel Grid.Row="1" Margin="0,8,0,0">
            <TextBlock x:Name="BadgeText" Text="STANDBY"
                       FontFamily="Consolas" FontSize="17" FontWeight="Bold"
                       Foreground="#A8B6C4"/>
            <TextBlock x:Name="DetailText" Text="等待 Codex 回合"
                       FontSize="10.5" Foreground="#8B9AAB" Margin="0,3,0,0"
                       TextTrimming="CharacterEllipsis"/>
          </StackPanel>

          <Grid Grid.Row="2" Margin="0,10,0,8">
            <Grid.RowDefinitions>
              <RowDefinition Height="*"/>
              <RowDefinition Height="*"/>
            </Grid.RowDefinitions>
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="*"/>
              <ColumnDefinition Width="*"/>
            </Grid.ColumnDefinitions>

            <Border Grid.Row="0" Grid.Column="0" CornerRadius="10" Background="#B0111820"
                    BorderBrush="#1D2B38" BorderThickness="1" Margin="0,0,5,5" Padding="8,5,8,4">
              <StackPanel>
                <TextBlock Text="CONTEXT" FontFamily="Consolas" FontSize="8" Foreground="#627487"/>
                <TextBlock x:Name="CtxText" Text="0.0%" FontFamily="Consolas" FontSize="15"
                           FontWeight="Bold" Foreground="#DCE4EE" Margin="0,1,0,0"/>
                <TextBlock x:Name="CtxSub" Text="0 / 0" FontFamily="Consolas" FontSize="8"
                           Foreground="#607284" TextTrimming="CharacterEllipsis"/>
              </StackPanel>
            </Border>

            <Border Grid.Row="0" Grid.Column="1" CornerRadius="10" Background="#B0111820"
                    BorderBrush="#1D2B38" BorderThickness="1" Margin="5,0,0,5" Padding="8,5,8,4">
              <StackPanel>
                <TextBlock Text="THROUGHPUT" FontFamily="Consolas" FontSize="8" Foreground="#627487"/>
                <TextBlock x:Name="TpsText" Text="--" FontFamily="Consolas" FontSize="15"
                           FontWeight="Bold" Foreground="#DCE4EE" Margin="0,1,0,0"/>
                <TextBlock x:Name="TpsSub" Text="tok/s · 首字--" FontFamily="Consolas" FontSize="7.5"
                           Foreground="#607284" TextTrimming="CharacterEllipsis"/>
              </StackPanel>
            </Border>

            <Border Grid.Row="1" Grid.Column="0" CornerRadius="10" Background="#B0111820"
                    BorderBrush="#1D2B38" BorderThickness="1" Margin="0,5,5,0" Padding="8,5,8,4">
              <StackPanel>
                <TextBlock Text="5H LIMIT" FontFamily="Consolas" FontSize="8" Foreground="#627487"/>
                <TextBlock x:Name="FiveText" Text="--" FontFamily="Consolas" FontSize="13"
                           FontWeight="Bold" Foreground="#DCE4EE" Margin="0,0,0,3"/>
                <Grid Height="3" Margin="0,0,0,3">
                  <Border CornerRadius="2" Background="#26313B"/>
                  <Rectangle x:Name="FiveFill" Width="90" Height="3" Fill="#FF7A45"
                             HorizontalAlignment="Left" RenderTransformOrigin="0,0.5">
                    <Rectangle.RenderTransform>
                      <ScaleTransform x:Name="FiveScale"/>
                    </Rectangle.RenderTransform>
                  </Rectangle>
                </Grid>
                <TextBlock x:Name="FiveSub" Text="已用" FontFamily="Consolas" FontSize="8"
                           Foreground="#607284"/>
              </StackPanel>
            </Border>

            <Border Grid.Row="1" Grid.Column="1" CornerRadius="10" Background="#B0111820"
                    BorderBrush="#1D2B38" BorderThickness="1" Margin="5,5,0,0" Padding="8,5,8,4">
              <StackPanel>
                <TextBlock Text="7D LIMIT" FontFamily="Consolas" FontSize="8" Foreground="#627487"/>
                <TextBlock x:Name="WeekText" Text="--" FontFamily="Consolas" FontSize="13"
                           FontWeight="Bold" Foreground="#DCE4EE" Margin="0,0,0,3"/>
                <Grid Height="3" Margin="0,0,0,3">
                  <Border CornerRadius="2" Background="#26313B"/>
                  <Rectangle x:Name="WeekFill" Width="90" Height="3" Fill="#5EEAD4"
                             HorizontalAlignment="Left" RenderTransformOrigin="0,0.5">
                    <Rectangle.RenderTransform>
                      <ScaleTransform x:Name="WeekScale"/>
                    </Rectangle.RenderTransform>
                  </Rectangle>
                </Grid>
                <TextBlock x:Name="WeekSub" Text="已用" FontFamily="Consolas" FontSize="8"
                           Foreground="#607284"/>
              </StackPanel>
            </Border>
          </Grid>

          <Grid Grid.Row="3">
            <TextBlock x:Name="ToolText" Text="TOOL -- · 0 CALLS"
                       FontFamily="Consolas" FontSize="8.5" Foreground="#66798A"
                       TextTrimming="CharacterEllipsis"/>
            <TextBlock x:Name="ElapsedText" Text="00:00"
                       FontFamily="Consolas" FontSize="8.5" Foreground="#66798A"
                       HorizontalAlignment="Right"/>
          </Grid>
        </Grid>
      </Grid>
    </Border>

    <Border x:Name="NoticeBar" Visibility="Collapsed" VerticalAlignment="Bottom"
            HorizontalAlignment="Center" Margin="52,0,52,4" Padding="12,5"
            CornerRadius="12" Background="#F01B120F" BorderBrush="#66FF7A45" BorderThickness="1">
      <TextBlock x:Name="NoticeText" Text="" FontSize="10" Foreground="#FFD4BE"
                 TextTrimming="CharacterEllipsis"/>
    </Border>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)
$window.Topmost = $true

$names = @(
  'Card','Stage','FloatTransform','ContextTicks','Glow','InnerHex','CorePulse','CoreScale',
  'CoreHalo','Core','OrbitA','OrbitARotate','OrbitADot','OrbitB','OrbitBRotate','OrbitBDot',
  'Sweep','SweepRotate','PulseLabel','WorkspaceText','ModelText','HeaderDot','CloseButton',
  'BadgeText','DetailText','CtxText','CtxSub','TpsText','TpsSub','FiveText','FiveFill',
  'FiveScale','FiveSub','WeekText','WeekFill','WeekScale','WeekSub','ToolText','ElapsedText',
  'NoticeBar','NoticeText'
)
$ui = @{}
foreach ($name in $names) {
  $ui[$name] = $window.FindName($name)
}

$brushCache = @{}
function Brush([string]$hex) {
  if (-not $brushCache.ContainsKey($hex)) {
    $brushCache[$hex] = New-Object System.Windows.Media.SolidColorBrush (
      [System.Windows.Media.ColorConverter]::ConvertFromString($hex)
    )
  }
  return $brushCache[$hex]
}

function Set-Text($element, [string]$text) {
  if ($null -ne $element) {
    $element.Text = $text
  }
}

function Format-Tokens($value) {
  $n = 0.0
  if ($null -ne $value) { [void][double]::TryParse([string]$value, [ref]$n) }
  if ($n -ge 1000000) { return ('{0:0.0}M' -f ($n / 1000000)) }
  if ($n -ge 1000) { return ('{0:0.0}K' -f ($n / 1000)) }
  return [string][int]$n
}

function Format-Percent($value) {
  $n = 0.0
  if ($null -ne $value) { [void][double]::TryParse([string]$value, [ref]$n) }
  return ('{0:0.0}%' -f $n)
}

function Format-Elapsed($ms) {
  $n = 0.0
  if ($null -ne $ms) { [void][double]::TryParse([string]$ms, [ref]$n) }
  $seconds = [Math]::Max(0, [Math]::Floor($n / 1000))
  $minutes = [Math]::Floor($seconds / 60)
  $remaining = $seconds % 60
  return ('{0:00}:{1:00}' -f $minutes, $remaining)
}

function Status-Palette([string]$status) {
  switch ($status) {
    'THINKING'      { return @{ Main = '#FF7A45'; Soft = '#FFB27A'; Badge = 'THINKING' } }
    'READING'       { return @{ Main = '#7DD3FC'; Soft = '#BAE6FD'; Badge = 'READING' } }
    'CODING'        { return @{ Main = '#5EEAD4'; Soft = '#99F6E4'; Badge = 'CODING' } }
    'RUNNING_CMD'   { return @{ Main = '#FFC857'; Soft = '#FDE68A'; Badge = 'EXECUTING' } }
    'AWAITING_NEXT' { return @{ Main = '#5EEAD4'; Soft = '#99F6E4'; Badge = 'READY' } }
    'ERROR'         { return @{ Main = '#FB7185'; Soft = '#FDA4AF'; Badge = 'ALERT' } }
    default         { return @{ Main = '#8B98A5'; Soft = '#B6C2CE'; Badge = 'STANDBY' } }
  }
}

$script:ticks = @()
function Build-ContextTicks {
  $ui.ContextTicks.Children.Clear()
  $script:ticks = @()
  $center = 66.0
  $outer = 58.0
  $inner = 52.0
  for ($i = 0; $i -lt 40; $i++) {
    $angle = (($i * 9.0) - 90.0) * [Math]::PI / 180.0
    $line = New-Object System.Windows.Shapes.Line
    $line.X1 = $center + ([Math]::Cos($angle) * $inner)
    $line.Y1 = $center + ([Math]::Sin($angle) * $inner)
    $line.X2 = $center + ([Math]::Cos($angle) * $outer)
    $line.Y2 = $center + ([Math]::Sin($angle) * $outer)
    $line.Stroke = Brush '#26323D'
    $line.StrokeThickness = 1.8
    $line.StrokeStartLineCap = [System.Windows.Media.PenLineCap]::Round
    $line.StrokeEndLineCap = [System.Windows.Media.PenLineCap]::Round
    $ui.ContextTicks.Children.Add($line) | Out-Null
    $script:ticks += $line
  }
}

Build-ContextTicks

$script:noticeUntil = [DateTime]::MinValue
$script:lastNoticeAt = 0
$script:bridgeFailures = 0
$script:closing = $false
$script:lastState = $null

$positionFile = Join-Path $env:LOCALAPPDATA 'CodexBeacon\window.json'
function Load-Position {
  try {
    $value = Get-Content -LiteralPath $positionFile -Raw | ConvertFrom-Json
    $left = [double]$value.left
    $top = [double]$value.top
    $leftMin = [System.Windows.SystemParameters]::VirtualScreenLeft
    $topMin = [System.Windows.SystemParameters]::VirtualScreenTop
    $leftMax = $leftMin + [System.Windows.SystemParameters]::VirtualScreenWidth - $window.Width
    $topMax = $topMin + [System.Windows.SystemParameters]::VirtualScreenHeight - $window.Height
    if ($left -ge $leftMin -and $left -le $leftMax -and $top -ge $topMin -and $top -le $topMax) {
      $window.Left = $left
      $window.Top = $top
      return
    }
  } catch {}
  Move-Default
}

function Move-Default {
  $area = [System.Windows.SystemParameters]::WorkArea
  $window.Left = $area.Right - $window.Width - 26
  $window.Top = $area.Bottom - $window.Height - 26
}

function Save-Position {
  try {
    $directory = Split-Path -Parent $positionFile
    if (-not (Test-Path -LiteralPath $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    @{ left = $window.Left; top = $window.Top } | ConvertTo-Json | Set-Content -LiteralPath $positionFile -Encoding UTF8
  } catch {}
}

function Stop-Beacon {
  if ($script:closing) { return }
  $script:closing = $true
  try {
    $body = @{} | ConvertTo-Json
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/quit" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 1 | Out-Null
  } catch {}
  $window.Close()
}

$ui.CloseButton.Add_Click({ Stop-Beacon })

$contextMenu = New-Object System.Windows.Controls.ContextMenu
$resetItem = New-Object System.Windows.Controls.MenuItem
$resetItem.Header = '重置位置'
$resetItem.Add_Click({ Move-Default; Save-Position })
$copyItem = New-Object System.Windows.Controls.MenuItem
$copyItem.Header = '复制当前状态'
$copyItem.Add_Click({
  if ($null -ne $script:lastState) {
    try {
      $summary = '{0} · {1} · context {2} · {3} tok/s' -f `
        $script:lastState.badge, $script:lastState.detail, (Format-Percent $script:lastState.context.percent), $script:lastState.speed.overall
      [System.Windows.Clipboard]::SetText($summary)
    } catch {}
  }
})
$quitItem = New-Object System.Windows.Controls.MenuItem
$quitItem.Header = '退出 Beacon'
$quitItem.Add_Click({ Stop-Beacon })
$contextMenu.Items.Add($resetItem) | Out-Null
$contextMenu.Items.Add($copyItem) | Out-Null
$contextMenu.Items.Add((New-Object System.Windows.Controls.Separator)) | Out-Null
$contextMenu.Items.Add($quitItem) | Out-Null
$ui.Card.ContextMenu = $contextMenu

$ui.Card.Add_MouseLeftButtonDown({
  if ($_.OriginalSource -is [System.Windows.Controls.Button]) { return }
  try { $window.DragMove() } catch {}
})
$window.Add_MouseLeftButtonUp({ Save-Position })

$pulse = New-Object System.Windows.Media.Animation.DoubleAnimation
$pulse.From = 0.94
$pulse.To = 1.06
$pulse.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(2.2))
$pulse.AutoReverse = $true
$pulse.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.CoreScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $pulse)
$ui.CoreScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $pulse)

$glowPulse = New-Object System.Windows.Media.Animation.DoubleAnimation
$glowPulse.From = 0.28
$glowPulse.To = 0.62
$glowPulse.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(1.8))
$glowPulse.AutoReverse = $true
$glowPulse.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.Glow.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $glowPulse)

$float = New-Object System.Windows.Media.Animation.DoubleAnimation
$float.From = -2.5
$float.To = 2.5
$float.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(4.2))
$float.AutoReverse = $true
$float.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.FloatTransform.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $float)

$orbitA = New-Object System.Windows.Media.Animation.DoubleAnimation
$orbitA.From = 0
$orbitA.To = 360
$orbitA.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(11))
$orbitA.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.OrbitARotate.BeginAnimation([System.Windows.Media.RotateTransform]::AngleProperty, $orbitA)

$orbitB = New-Object System.Windows.Media.Animation.DoubleAnimation
$orbitB.From = 360
$orbitB.To = 0
$orbitB.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(18))
$orbitB.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.OrbitBRotate.BeginAnimation([System.Windows.Media.RotateTransform]::AngleProperty, $orbitB)

$sweep = New-Object System.Windows.Media.Animation.DoubleAnimation
$sweep.From = 0
$sweep.To = 360
$sweep.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(3.2))
$sweep.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.SweepRotate.BeginAnimation([System.Windows.Media.RotateTransform]::AngleProperty, $sweep)

function Update-ContextTicks([double]$percent, [string]$color) {
  $active = [Math]::Max(0, [Math]::Min(40, [Math]::Round(($percent / 100.0) * 40.0)))
  for ($i = 0; $i -lt $script:ticks.Count; $i++) {
    $tick = $script:ticks[$i]
    if ($i -lt $active) {
      $tick.Stroke = Brush $color
      $tick.Opacity = 0.95
      $tick.StrokeThickness = 2.1
    } else {
      $tick.Stroke = Brush '#26323D'
      $tick.Opacity = 0.7
      $tick.StrokeThickness = 1.8
    }
  }
}

function Update-Bar($scale, $value, [string]$color) {
  $n = 0.0
  if ($null -ne $value) { [void][double]::TryParse([string]$value, [ref]$n) }
  $scale.ScaleX = [Math]::Max(0.0, [Math]::Min(1.0, $n / 100.0))
  $scale.ScaleY = 1.0
}

function Update-Beacon {
  $state = $null
  try {
    $state = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/state" -TimeoutSec 1
    $script:bridgeFailures = 0
  } catch {
    $script:bridgeFailures += 1
    $state = $null
  }

  if ($null -eq $state -or -not $state.ok) {
    $palette = Status-Palette 'ERROR'
    Set-Text $ui.BadgeText 'LINK LOST'
    Set-Text $ui.DetailText '等待本地 Beacon 桥接服务'
    $ui.BadgeText.Foreground = Brush $palette.Main
    $ui.HeaderDot.Fill = Brush $palette.Main
    $ui.Core.Fill = Brush $palette.Main
    $ui.Glow.Opacity = 0.18
    $ui.Sweep.Opacity = 0.08
    if ($script:bridgeFailures -ge 8) {
      $script:closing = $true
      $window.Close()
    }
    return
  }

  $script:lastState = $state
  $palette = Status-Palette ([string]$state.status)
  $badge = [string]$state.badge
  if ([string]::IsNullOrWhiteSpace($badge)) { $badge = $palette.Badge }

  Set-Text $ui.BadgeText $badge
  Set-Text $ui.DetailText ([string]$state.detail)
  Set-Text $ui.WorkspaceText ([string]$state.workspace)
  Set-Text $ui.ModelText ([string]$state.model)
  Set-Text $ui.CtxText (Format-Percent $state.context.percent)
  Set-Text $ui.CtxSub ('{0} / {1}' -f (Format-Tokens $state.context.used), (Format-Tokens $state.context.limit))
  Set-Text $ui.TpsText ([string]$state.speed.overall)
  Set-Text $ui.TpsSub ('tok/s · 首字{0:0.0}s' -f $state.speed.ttft)

  $fiveUsed = $null
  $weekUsed = $null
  if ($null -ne $state.quota -and $null -ne $state.quota.fiveHour) { $fiveUsed = $state.quota.fiveHour.usedPercent }
  if ($null -ne $state.quota -and $null -ne $state.quota.weekly) { $weekUsed = $state.quota.weekly.usedPercent }

  if ($null -ne $fiveUsed) {
    Set-Text $ui.FiveText (Format-Percent $fiveUsed)
    Set-Text $ui.FiveSub '窗口已用'
    $fiveColor = if ($fiveUsed -ge 80) { '#FB7185' } elseif ($fiveUsed -ge 50) { '#FFC857' } else { '#FF7A45' }
    $ui.FiveFill.Fill = Brush $fiveColor
    Update-Bar $ui.FiveScale $fiveUsed $fiveColor
  } else {
    Set-Text $ui.FiveText '--'
    Set-Text $ui.FiveSub '暂无额度快照'
    Update-Bar $ui.FiveScale 0 '#FF7A45'
  }

  if ($null -ne $weekUsed) {
    Set-Text $ui.WeekText (Format-Percent $weekUsed)
    Set-Text $ui.WeekSub '窗口已用'
    $weekColor = if ($weekUsed -ge 80) { '#FB7185' } elseif ($weekUsed -ge 50) { '#FFC857' } else { '#5EEAD4' }
    $ui.WeekFill.Fill = Brush $weekColor
    Update-Bar $ui.WeekScale $weekUsed $weekColor
  } else {
    Set-Text $ui.WeekText '--'
    Set-Text $ui.WeekSub '暂无额度快照'
    Update-Bar $ui.WeekScale 0 '#5EEAD4'
  }

  $toolName = [string]$state.tools.last
  if ([string]::IsNullOrWhiteSpace($toolName)) { $toolName = '--' }
  Set-Text $ui.ToolText ('TOOL {0} · {1} CALLS' -f $toolName.ToUpperInvariant(), $state.tools.count)
  Set-Text $ui.ElapsedText (Format-Elapsed $state.elapsedMs)
  $pulseCode = switch ([string]$state.status) {
    'THINKING'      { 'THK' }
    'READING'       { 'RD' }
    'CODING'        { 'CD' }
    'RUNNING_CMD'   { 'RUN' }
    'AWAITING_NEXT' { 'RDY' }
    'ERROR'         { 'ERR' }
    default         { 'IDLE' }
  }
  Set-Text $ui.PulseLabel $pulseCode

  $ui.BadgeText.Foreground = Brush $palette.Main
  $ui.HeaderDot.Fill = Brush $palette.Main
  $ui.Core.Fill = Brush $palette.Main
  $ui.CoreHalo.Opacity = if ($state.status -eq 'AWAITING_NEXT' -or $state.status -eq 'IDLE') { 0.22 } else { 0.55 }
  $ui.InnerHex.Stroke = Brush $palette.Main
  $ui.OrbitADot.Fill = Brush $palette.Soft
  $ui.Sweep.Opacity = if ($state.status -eq 'THINKING' -or $state.status -eq 'READING' -or $state.status -eq 'CODING' -or $state.status -eq 'RUNNING_CMD') { 0.46 } else { 0.08 }

  $ctxColor = if ($state.context.percent -ge 85) { '#FB7185' } elseif ($state.context.percent -ge 62) { '#FFC857' } else { '#5EEAD4' }
  Update-ContextTicks ([double]$state.context.percent) $ctxColor

  if ($null -ne $state.notice -and [double]$state.notice.at -gt $script:lastNoticeAt) {
    $script:lastNoticeAt = [double]$state.notice.at
    $script:noticeUntil = [DateTime]::Now.AddSeconds(8)
    $ui.NoticeText.Text = [string]$state.notice.message
    $ui.NoticeBar.Visibility = 'Visible'
  }

  if ([DateTime]::Now -gt $script:noticeUntil) {
    $ui.NoticeBar.Visibility = 'Collapsed'
  }
}

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({ Update-Beacon })

$window.Add_Closed({
  $timer.Stop()
  Save-Position
  try { $mutex.ReleaseMutex() } catch {}
  try { $mutex.Dispose() } catch {}
})

$window.Add_Loaded({
  Load-Position
  Update-Beacon
  $timer.Start()
})

[void]$window.ShowDialog()
