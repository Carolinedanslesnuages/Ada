{{- define "app.nom" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "app.nomComplet" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "app.selecteurs" -}}
app.kubernetes.io/name: {{ include "app.nom" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "app.etiquettes" -}}
{{ include "app.selecteurs" . }}
app.kubernetes.io/version: {{ .Values.api.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end -}}

{{/* Secret qui contient l'adresse de la base (clé DATABASE_URL par défaut), créé hors du chart. */}}
{{- define "app.secretBase" -}}
{{- .Values.database.existingSecret | default (printf "%s-base" (include "app.nomComplet" .)) -}}
{{- end -}}
