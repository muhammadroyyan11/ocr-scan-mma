<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->canWrite();
    }

    public function rules(): array
    {
        return [
            'confirmed' => 'required|accepted',
            'product_name' => 'nullable|string|max:255',
            'product_reference' => 'nullable|string|max:255',
            'barcode' => 'nullable|string|max:255',
            'lot_number' => 'nullable|string|max:255',
            'mfg_raw' => 'nullable|string|max:255',
            'exp_raw' => 'nullable|string|max:255',
            'mfg_date' => 'nullable|date_format:Y-m-d|after_or_equal:1000-01-01|before_or_equal:9999-12-31',
            'exp_date' => 'nullable|date_format:Y-m-d|after_or_equal:1000-01-01|before_or_equal:9999-12-31',
            'mfg_month' => 'nullable|date_format:Y-m|after_or_equal:1000-01|before_or_equal:9999-12',
            'exp_month' => 'nullable|date_format:Y-m|after_or_equal:1000-01|before_or_equal:9999-12',
            'ocr_raw_text' => 'nullable|string|max:20000',
            'ocr_confidence' => 'nullable|numeric|between:0,100',
            'verification_status' => ['required', Rule::in(['verified', 'needs_review'])],
            'notes' => 'nullable|string|max:5000',
            'scans' => 'sometimes|array|max:30',
            'scans.*' => 'array:field_type,raw_text,normalized_text,confidence,crop_metadata',
            'scans.*.field_type' => ['required', Rule::in(['LOT', 'MFG', 'EXP', 'OTHER'])],
            'scans.*.raw_text' => 'nullable|string|max:2000',
            'scans.*.normalized_text' => 'nullable|string|max:2000',
            'scans.*.confidence' => 'nullable|numeric|between:0,100',
            'scans.*.crop_metadata' => 'nullable|array:x,y,width,height,image_width,image_height,preset',
            'scans.*.crop_metadata.x' => 'required_with:scans.*.crop_metadata|numeric|min:0|max:6000',
            'scans.*.crop_metadata.y' => 'required_with:scans.*.crop_metadata|numeric|min:0|max:6000',
            'scans.*.crop_metadata.width' => 'required_with:scans.*.crop_metadata|numeric|gt:0|max:6000',
            'scans.*.crop_metadata.height' => 'required_with:scans.*.crop_metadata|numeric|gt:0|max:6000',
            'scans.*.crop_metadata.image_width' => 'required_with:scans.*.crop_metadata|integer|between:1,6000',
            'scans.*.crop_metadata.image_height' => 'required_with:scans.*.crop_metadata|integer|between:1,6000',
            'scans.*.crop_metadata.preset' => ['nullable', Rule::in(['original', 'grayscale', 'contrast', 'threshold'])],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $fields = ['product_name', 'product_reference', 'barcode', 'lot_number', 'mfg_raw', 'mfg_date', 'mfg_month', 'exp_raw', 'exp_date', 'exp_month', 'ocr_raw_text'];
            foreach (['mfg', 'exp'] as $field) {
                if (filled($this->input($field.'_date')) && filled($this->input($field.'_month'))) {
                    $validator->errors()->add($field.'_month', 'Pilih tanggal lengkap atau bulan/tahun saja, bukan keduanya.');
                }
            }
            if (! collect($fields)->contains(fn ($field) => filled($this->input($field)))) {
                $validator->errors()->add('lot_number', 'Isi setidaknya satu informasi produk atau hasil OCR.');
            }
            foreach ((array) $this->input('scans', []) as $index => $scan) {
                $crop = is_array($scan) ? ($scan['crop_metadata'] ?? null) : null;
                if (is_array($crop) && isset($crop['x'], $crop['y'], $crop['width'], $crop['height'], $crop['image_width'], $crop['image_height'])) {
                    if (is_numeric($crop['x']) && is_numeric($crop['width']) && is_numeric($crop['y']) && is_numeric($crop['height']) && is_numeric($crop['image_width']) && is_numeric($crop['image_height']) && ($crop['image_width'] < $crop['x'] + $crop['width'] || $crop['image_height'] < $crop['y'] + $crop['height'])) {
                        $validator->errors()->add("scans.$index.crop_metadata", 'Area crop melewati batas gambar.');
                    }
                }
            }
        });
    }
}
