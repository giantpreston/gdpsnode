module.exports = {
    method: 'get',
    path: '/content/news/news.dat',
    handler: (req, res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send("H4sIAAAAAAACA12RzZKbMBCEX2gPIExVsMsH41hClCEFXhDohtCWxFpsXOHPUHn4DKxPuQHN9Hzds3uz_9p7-4D27yi2BApN3Zye0XlS0edpjtXxeHD2Ocq7Enk9v_mWmH1XOPlMiWvk7Acp9t9F691BW3gRIl5Qfdjtrbf_hqyKZKps80WefS2C1NStqyUx6KUnN3xSFdspSbShF3nJcKRy5M2CJBrekxTHg0CpocQslNiag1-NfqgP5tmUxFo0vl2jTFVFokrm3inRWraZ4l_5QAP5kERt_9aN_ymQ3UvmPmRwVxIZYPNs4NoYK4KXGj1hj9fSC55KFv_mN-8XR2b4WNnbRGUXnVwbP4QdYw0zq2-Inh0lz3HdCQzwDHMs_kMDM8qCKg6-FQnHsgiBjY_A0QsnXPP0NfFmSfAADFBialXM_arn713As3bUSrbT9Oe00LOGA0CXCA-UpI8a4UYAA_T2gJmeF_FSMgm-oQu6ESTf_GiQQg5_4IVcrm2qYVdbsTWnGV6aEW06Ccgpg6hbv5XQpUTYfekzZ7hbb7Md34nW7joBzNCfQ4N8okGo1_tBNugSb75VESmBXHNt7sd__hkzJG4CAAA=");
    }
}