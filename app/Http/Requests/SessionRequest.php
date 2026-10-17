<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->canWrite();
    }

    public function rules(): array
    {
        return ['reference_number' => 'nullable|string|max:255', 'supplier_name' => 'nullable|string|max:255', 'store_code' => 'nullable|string|max:80', 'notes' => 'nullable|string|max:5000'];
    }
}
