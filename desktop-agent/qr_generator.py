import qrcode

def generate_qr(data):

    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=4,
    )

    qr.add_data(data)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")

    image.save("pair_qr.png")

    print("QR saved -> pair_qr.png")