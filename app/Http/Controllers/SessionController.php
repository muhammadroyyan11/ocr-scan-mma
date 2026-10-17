<?php

namespace App\Http\Controllers;

use App\Http\Requests\SessionRequest;
use App\Models\ReceivingSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SessionController extends Controller
{
    public function index(Request $request)
    {
        $query = ReceivingSession::accessibleTo($request->user())->with('creator:id,name')->withCount(['items', 'items as verified_count' => fn ($query) => $query->where('verification_status', 'verified')]);
        if ($search = $request->string('search')->limit(100)->toString()) {
            $query->where(fn ($query) => $query->where('session_number', 'like', "%$search%")->orWhere('supplier_name', 'like', "%$search%")->orWhere('reference_number', 'like', "%$search%"));
        }
        if (in_array($request->input('status'), ['open', 'completed'], true)) {
            $query->where('status', $request->input('status'));
        }
        $sessions = $query->latest('id')->paginate(15)->withQueryString();

        return $request->is('api/*') ? response()->json(['data' => $sessions, 'message' => 'Daftar sesi.']) : view('sessions.index', compact('sessions'));
    }

    public function store(SessionRequest $request)
    {
        $session = ReceivingSession::create([...$request->validated(), 'created_by' => $request->user()->id, 'session_number' => 'RCV-'.now()->format('Ymd').'-'.Str::ulid(), 'status' => 'open']);

        return response()->json(['data' => $session, 'message' => 'Sesi penerimaan dibuat.'], 201);
    }

    public function show(Request $request, ReceivingSession $session)
    {
        $this->authorize('view', $session);
        $session->load('creator:id,name')->loadCount(['items', 'items as verified_count' => fn ($query) => $query->where('verification_status', 'verified')]);
        $items = $session->items()->latest('id')->paginate(30);

        return $request->is('api/*') ? response()->json(['data' => ['session' => $session, 'items' => $items], 'message' => 'Detail sesi.']) : view('sessions.show', compact('session', 'items'));
    }

    public function status(Request $request, ReceivingSession $session)
    {
        $this->authorize('changeStatus', $session);
        $data = $request->validate(['status' => 'required|in:open,completed']);
        DB::transaction(function () use ($session, $data) {
            $locked = ReceivingSession::lockForUpdate()->findOrFail($session->id);
            $locked->update($data);
        });

        return response()->json(['data' => $session->fresh(), 'message' => 'Status sesi diperbarui.']);
    }

    public function export(ReceivingSession $session)
    {
        $this->authorize('view', $session);

        return response()->streamDownload(function () use ($session) {
            $output = fopen('php://output', 'w');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['session_number', 'product_name', 'product_reference', 'barcode', 'lot_number', 'mfg_raw', 'mfg_date', 'exp_raw', 'exp_date', 'verification_status', 'ocr_confidence', 'notes', 'mfg_month', 'exp_month']);
            foreach ($session->items()->orderBy('id')->cursor() as $item) {
                $values = [$session->session_number, $item->product_name, $item->product_reference, $item->barcode, $item->lot_number, $item->mfg_raw, $item->mfg_date?->format('Y-m-d'), $item->exp_raw, $item->exp_date?->format('Y-m-d'), $item->verification_status, $item->ocr_confidence, $item->notes, $item->mfg_month, $item->exp_month];
                fputcsv($output, array_map(fn ($value) => preg_match('/^[\s]*[=+@\-]/u', (string) $value) || preg_match('/^[\t\r\n]/', (string) $value) ? "'".$value : $value, $values));
            }
            fclose($output);
        }, $session->session_number.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
